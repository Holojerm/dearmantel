// A letter's photo against a real D1 and a real bucket: only the author can
// change it, only before sealing, and the recipient gets nothing until the
// letter has arrived.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { photoStorageKey } from '../shared/utils/letter-photo'
import { discardDraft, saveDraft } from '../server/utils/drafts'
import {
  attachPhoto,
  detachPhoto,
  readPhoto,
  removeDraftPhotos,
  type PhotoStore,
} from '../server/utils/photos'
import { recallLetter, sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  people,
  userKeys,
  postalProfiles,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
} = schema

const store: PhotoStore = {
  async put(key, bytes) {
    await env.BLOB.put(key, bytes)
  },
  async get(key) {
    const found = await env.BLOB.get(key)
    return found ? found.arrayBuffer() : null
  },
  async remove(keys) {
    await env.BLOB.delete(keys)
  },
}

const MONDAY = new Date('2026-11-16T20:00:00Z')
const LETTER = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`

const sealedFile = (fill: number) => new Uint8Array(64).fill(fill)
const stored = async (photoId: string) =>
  (await env.BLOB.head(photoStorageKey(LETTER, photoId))) !== null
const attach = (author: string, photoId: string, fill = 7) =>
  attachPhoto(db, store, author, { letterId: LETTER, photoId, bytes: sealedFile(fill) }, MONDAY)
const firstByte = async (userId: string) => {
  const file = await readPhoto(db, store, userId, LETTER, MONDAY)
  return file ? new Uint8Array(file)[0] : null
}

beforeEach(async () => {
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    correspondenceMembers,
    correspondences,
    postalProfiles,
    userKeys,
    people,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  const listed = await env.BLOB.list()
  if (listed.objects.length > 0) await env.BLOB.delete(listed.objects.map((object) => object.key))

  for (const id of ['ann', 'bob', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({
      userId: id,
      cityName: 'Chicago',
      country: 'US',
      lat: 41.85,
      lng: -87.65,
      timeZone: 'America/Chicago',
    })
  }
  await db.insert(correspondences).values({ id: 'pair' })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: 'pair', userId: 'ann' },
    { correspondenceId: 'pair', userId: 'bob' },
  ])
  await saveDraft(
    db,
    'ann',
    { id: LETTER, correspondenceId: 'pair', ciphertext: CIPHERTEXT, wrappedKey: 'key-for-ann' },
    MONDAY,
  )
})

describe('a draft', () => {
  it('takes a photo from its author only', async () => {
    expect(await attach('bob', FIRST)).toBe('not-yours')
    expect(await stored(FIRST)).toBe(false)

    expect(await attach('ann', FIRST)).toBe('done')
    expect(await firstByte('ann')).toBe(7)
    expect(await firstByte('bob')).toBeNull()
    expect(await firstByte('eve')).toBeNull()
  })

  it('keeps one photo: a second replaces the first and deletes its file', async () => {
    await attach('ann', FIRST, 7)
    expect(await attach('ann', SECOND, 9)).toBe('done')

    expect(await firstByte('ann')).toBe(9)
    expect(await stored(FIRST)).toBe(false)
    expect(await stored(SECOND)).toBe(true)
  })

  it('gives the photo up, and its file goes', async () => {
    await attach('ann', FIRST)
    expect(await detachPhoto(db, store, 'bob', LETTER, MONDAY)).toBe('not-yours')
    expect(await detachPhoto(db, store, 'ann', LETTER, MONDAY)).toBe('done')

    expect(await firstByte('ann')).toBeNull()
    expect(await stored(FIRST)).toBe(false)
  })

  it('takes its file with it when it is thrown away', async () => {
    await attach('ann', FIRST)
    expect(await discardDraft(db, 'ann', LETTER, store)).toBe(true)
    expect(await stored(FIRST)).toBe(false)
  })

  it('loses its file when its author deletes their account', async () => {
    await attach('ann', FIRST)
    expect(await removeDraftPhotos(db, store, 'bob')).toBe(0)
    expect(await removeDraftPhotos(db, store, 'ann')).toBe(1)
    expect(await stored(FIRST)).toBe(false)
  })
})

describe('a sealed letter', () => {
  beforeEach(async () => {
    await attach('ann', FIRST)
    await sealLetter(db, 'ann', LETTER, 'key-for-bob', MONDAY)
  })

  it('cannot have its photo changed or removed', async () => {
    expect(await attach('ann', SECOND, 9)).toBe('sealed')
    expect(await detachPhoto(db, store, 'ann', LETTER, MONDAY)).toBe('sealed')
    expect(await stored(SECOND)).toBe(false)
    expect(await firstByte('ann')).toBe(7)
  })

  it('shows the recipient no photo until it is delivered', async () => {
    expect(await firstByte('bob')).toBeNull()

    await db
      .update(deliveries)
      .set({ state: 'delivered', deliveredAt: MONDAY, mailDate: '2026-11-20' })
      .where(eq(deliveries.letterId, LETTER))
    expect(await firstByte('bob')).toBe(7)
    expect(await firstByte('eve')).toBeNull()
  })

  it('reading the photo does not mark the letter opened', async () => {
    await db
      .update(deliveries)
      .set({ state: 'delivered', deliveredAt: MONDAY, mailDate: '2026-11-20' })
      .where(eq(deliveries.letterId, LETTER))
    await firstByte('bob')
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.letterId, LETTER))
    expect(delivery?.openedAt).toBeNull()
  })

  it('keeps its photo when recalled, and can change it again', async () => {
    expect(await recallLetter(db, 'ann', LETTER, MONDAY)).toBe('recalled')
    expect(await firstByte('ann')).toBe(7)
    expect(await attach('ann', SECOND, 9)).toBe('done')
    expect(await firstByte('ann')).toBe(9)
  })
})

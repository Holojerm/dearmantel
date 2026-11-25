// The mantel against a real D1: nothing shows before delivery, only the
// recipient can open a letter, and a reply answers a letter that arrived.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { ownLetter, saveDraft } from '../server/utils/drafts'
import { listMantel, openLetter } from '../server/utils/mantel'
import { sealLetter } from '../server/utils/posting'

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

const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T16:00:00Z')
const LETTER = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const REPLY = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`

async function write(id: string, author: string, inReplyTo?: string) {
  return saveDraft(
    db,
    author,
    {
      id,
      correspondenceId: 'pair',
      ciphertext: CIPHERTEXT,
      wrappedKey: `key-for-${author}`,
      inReplyTo,
    },
    MONDAY,
  )
}

/** What the release task does on the recipient's mail day. */
async function deliver(letterId: string) {
  await db
    .update(deliveries)
    .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20' })
    .where(eq(deliveries.letterId, letterId))
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
  await db.insert(people).values([
    { userId: 'ann', displayName: 'Ann Lee' },
    { userId: 'bob', displayName: 'Bob Stone' },
  ])
  await db.insert(correspondences).values({ id: 'pair' })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: 'pair', userId: 'ann' },
    { correspondenceId: 'pair', userId: 'bob' },
  ])
  await write(LETTER, 'ann')
  await sealLetter(db, 'ann', LETTER, 'key-for-bob', MONDAY)
})

describe('before delivery', () => {
  it('shows the recipient nothing and opens nothing', async () => {
    expect(await listMantel(db, 'bob', FRIDAY)).toEqual([])
    expect(await openLetter(db, 'bob', LETTER, FRIDAY)).toBeNull()
  })
})

describe('after delivery', () => {
  beforeEach(() => deliver(LETTER))

  it('lists the letter for its recipient only, unopened, with its sender and postmark', async () => {
    expect(await listMantel(db, 'bob', FRIDAY)).toEqual([
      {
        letterId: LETTER,
        correspondenceId: 'pair',
        kind: 'letter',
        name: 'Ann Lee',
        news: null,
        postmark: '2026-11-16',
        arrivedOn: '2026-11-20',
        opened: false,
        sealedUntil: null,
      },
    ])
    expect(await listMantel(db, 'ann', FRIDAY)).toEqual([])
    expect(await listMantel(db, 'eve', FRIDAY)).toEqual([])
  })

  it('opens for the recipient with their own key, and records the first opening once', async () => {
    const opened = await openLetter(db, 'bob', LETTER, FRIDAY)
    expect(opened).toMatchObject({
      kind: 'letter',
      name: 'Ann Lee',
      ciphertext: CIPHERTEXT,
      wrappedKey: 'key-for-bob',
      canReply: true,
    })
    expect((await listMantel(db, 'bob', FRIDAY))[0]?.opened).toBe(true)

    await openLetter(db, 'bob', LETTER, new Date(FRIDAY.getTime() + 60_000))
    const [delivery] = await db.select().from(deliveries)
    expect(delivery?.openedAt?.getTime()).toBe(FRIDAY.getTime())
  })

  it('does not open for the sender through the mantel, or for anyone else', async () => {
    expect(await openLetter(db, 'ann', LETTER, FRIDAY)).toBeNull()
    expect(await openLetter(db, 'eve', LETTER, FRIDAY)).toBeNull()
    expect((await db.select().from(deliveries))[0]?.openedAt).toBeNull()
  })

  it('cannot be replied to once the correspondence is closed', async () => {
    await db.update(correspondences).set({ closedAt: FRIDAY, closedBy: 'ann' })
    expect((await openLetter(db, 'bob', LETTER, FRIDAY))?.canReply).toBe(false)
  })
})

describe('a reply', () => {
  it('answers a letter that has arrived for its writer', async () => {
    expect(await write(REPLY, 'bob', LETTER)).toBe('not-received')
    await deliver(LETTER)
    expect(await write(REPLY, 'bob', LETTER)).toBe('saved')
    expect((await ownLetter(db, 'bob', REPLY))?.inReplyTo).toBe(LETTER)
  })

  it('cannot answer the writer’s own letter or one that does not exist', async () => {
    await deliver(LETTER)
    expect(await write(REPLY, 'ann', LETTER)).toBe('not-received')
    expect(await write(REPLY, 'bob', '00000000-0000-4000-8000-000000000000')).toBe('not-received')
  })
})

describe('a returned letter', () => {
  it('comes back to its author, names who it was for, and cannot be replied to', async () => {
    await db.update(deliveries).set({ state: 'returned' })
    await db.insert(deliveries).values({
      letterId: LETTER,
      recipientId: 'ann',
      kind: 'return',
      earliestDate: '2026-11-21',
      promisedDate: '2026-11-21',
      transitDays: 0,
      state: 'delivered',
      deliveredAt: FRIDAY,
      mailDate: '2026-11-21',
    })

    expect(await listMantel(db, 'bob', FRIDAY)).toEqual([])
    expect(await listMantel(db, 'ann', FRIDAY)).toMatchObject([
      { kind: 'return', name: 'Bob Stone' },
    ])
    expect(await openLetter(db, 'ann', LETTER, FRIDAY)).toMatchObject({
      kind: 'return',
      name: 'Bob Stone',
      wrappedKey: 'key-for-ann',
      canReply: false,
    })
  })
})

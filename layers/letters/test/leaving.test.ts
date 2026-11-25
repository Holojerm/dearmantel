// Leaving, against a real D1: closing a correspondence and deleting an
// account both follow the paper rule. A letter belongs to its recipient.

import { env } from 'cloudflare:test'
import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { clearExtensionsForTest, getAccountContributors } from '#server/utils/extensions'

import { closeCorrespondence } from '../server/utils/closing'
import { ownLetter, saveDraft } from '../server/utils/drafts'
import { registerLettersExtensions } from '../server/utils/letters-extensions'
import { listMantel, openLetter } from '../server/utils/mantel'
import { planSeal, sealLetter } from '../server/utils/posting'

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
  invites,
} = schema

const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T16:00:00Z')
const FROM_ANN = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const FROM_BOB = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const SECOND_FROM_BOB = '11111111-2222-4333-8444-555555555555'
const DRAFT = '66666666-7777-4888-9999-aaaaaaaaaaaa'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`

async function post(id: string, author: 'ann' | 'bob', seal = true) {
  const reader = author === 'ann' ? 'bob' : 'ann'
  await saveDraft(
    db,
    author,
    { id, correspondenceId: 'pair', ciphertext: CIPHERTEXT, wrappedKey: `key-for-${author}` },
    MONDAY,
  )
  if (seal) await sealLetter(db, author, id, `key-for-${reader}`, MONDAY)
}

const deliveryOf = async (letterId: string, kind = 'letter') =>
  (
    await db
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.letterId, letterId), eq(deliveries.kind, kind)))
  )[0]

beforeEach(async () => {
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    invites,
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
  await db.insert(correspondences).values({ id: 'pair' })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: 'pair', userId: 'ann' },
    { correspondenceId: 'pair', userId: 'bob' },
  ])
})

describe('closing a correspondence', () => {
  it('returns letters on their way to the person who closed it; theirs still arrive', async () => {
    await post(FROM_ANN, 'ann')
    await post(FROM_BOB, 'bob')

    expect(await closeCorrespondence(db, 'eve', 'pair', FRIDAY)).toBe('not-yours')
    expect(await closeCorrespondence(db, 'ann', 'pair', FRIDAY)).toBe('closed')

    expect((await deliveryOf(FROM_BOB))?.state).toBe('returned')
    expect(await deliveryOf(FROM_BOB, 'return')).toMatchObject({ recipientId: 'bob' })
    expect((await deliveryOf(FROM_ANN))?.state).toBe('in_transit')
    expect((await db.select().from(correspondences))[0]).toMatchObject({ closedBy: 'ann' })
  })

  it('ends new letters for both, and is not repeated', async () => {
    await closeCorrespondence(db, 'bob', 'pair', FRIDAY)

    expect(await planSeal(db, 'ann', 'pair', FRIDAY)).toBe('closed')
    expect(await planSeal(db, 'bob', 'pair', FRIDAY)).toBe('closed')
    expect(await closeCorrespondence(db, 'ann', 'pair', FRIDAY)).toBe('already-closed')
    expect((await db.select().from(correspondences))[0]?.closedBy).toBe('bob')
  })
})

describe('deleting an account', () => {
  beforeEach(() => {
    clearExtensionsForTest()
    registerLettersExtensions()
  })

  it('removes what the person received and drafted, and keeps what they sent', async () => {
    await post(FROM_ANN, 'ann')
    await post(FROM_BOB, 'bob')
    await post(SECOND_FROM_BOB, 'bob')
    await post(DRAFT, 'ann', false)
    // Ann's letter reached Bob; Bob's first reached Ann; his second is on its way.
    for (const id of [FROM_ANN, FROM_BOB]) {
      await db
        .update(deliveries)
        .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20' })
        .where(eq(deliveries.letterId, id))
    }

    const contributor = getAccountContributors().find((c) => c.key === 'letters')!
    await contributor.beforeDeletion!(db, 'ann')
    const statements = contributor.deletionStatements!(db, 'ann') as BatchItem<'sqlite'>[]
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

    // Her draft is gone, with its key.
    expect(await db.select().from(letters).where(eq(letters.id, DRAFT))).toHaveLength(0)
    // What she sent stays with Bob, readable, with no author account.
    const [sent] = await db.select().from(letters).where(eq(letters.id, FROM_ANN))
    expect(sent?.authorId).toBeNull()
    expect(await openLetter(db, 'bob', FROM_ANN, FRIDAY)).toMatchObject({
      wrappedKey: 'key-for-bob',
      name: null,
      canReply: false,
    })
    // What she received is no longer hers; Bob keeps his own copy of what he wrote.
    expect(await db.select().from(deliveries).where(eq(deliveries.recipientId, 'ann'))).toEqual([])
    expect(await db.select().from(letterKeys).where(eq(letterKeys.userId, 'ann'))).toEqual([])
    expect(await ownLetter(db, 'bob', FROM_BOB)).not.toBeNull()
    // The letter that was still on its way to her comes back to Bob.
    expect(await deliveryOf(SECOND_FROM_BOB, 'return')).toMatchObject({ recipientId: 'bob' })
    expect((await listMantel(db, 'bob', FRIDAY)).map((item) => item.letterId)).toEqual([FROM_ANN])
  })
})

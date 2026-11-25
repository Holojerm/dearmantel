// The data export against a real D1: it holds what the person wrote and what
// has arrived for them, encrypted as stored, and it keeps the product's rules:
// nothing still on its way, and nothing about what became of a sent letter.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { exportPost } from '#layers/post/server/utils/post-export'

import { saveDraft } from '../server/utils/drafts'
import { exportLetters } from '../server/utils/letters-export'
import { sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  people,
  userKeys,
  postalProfiles,
  notices,
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

beforeEach(async () => {
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    invites,
    correspondenceMembers,
    correspondences,
    notices,
    postalProfiles,
    userKeys,
    people,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob']) {
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

  await post(FROM_ANN, 'ann')
  await post(DRAFT, 'ann', false)
  await post(FROM_BOB, 'bob')
  await post(SECOND_FROM_BOB, 'bob')
  // Ann's letter reached Bob and he opened it. Bob's first reached Ann; his
  // second is still on its way to her.
  await db
    .update(deliveries)
    .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20', openedAt: FRIDAY })
    .where(eq(deliveries.letterId, FROM_ANN))
  await db
    .update(deliveries)
    .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20' })
    .where(eq(deliveries.letterId, FROM_BOB))
})

describe('the letters section', () => {
  it('names the person and who they write with', async () => {
    const data = await exportLetters(db, 'ann', FRIDAY)

    expect(data.name).toBe('Ann Lee')
    expect(data.correspondences).toEqual([
      { id: 'pair', with: 'Bob Stone', since: expect.any(String), closedAt: null },
    ])
  })

  it('holds what they wrote, drafts included, encrypted with their own key', async () => {
    const { written } = await exportLetters(db, 'ann', FRIDAY)

    expect(written.map((letter) => letter.id).toSorted()).toEqual([FROM_ANN, DRAFT].toSorted())
    for (const letter of written) {
      expect(letter.ciphertext).toBe(CIPHERTEXT)
      expect(letter.wrappedKey).toBe('key-for-ann')
    }
    expect(written.find((letter) => letter.id === DRAFT)?.sealedAt).toBeNull()
  })

  it('says nothing about what became of a letter they sent', async () => {
    const data = await exportLetters(db, 'ann', FRIDAY)
    const sent = data.written.find((letter) => letter.id === FROM_ANN)!

    expect(Object.keys(sent).toSorted()).toEqual(
      [
        'ciphertext',
        'correspondenceId',
        'hasPhoto',
        'id',
        'inReplyTo',
        'postmark',
        'sealedAt',
        'wrappedKey',
      ].toSorted(),
    )
    expect(JSON.stringify(data)).not.toContain(FRIDAY.toISOString())
  })

  it('holds only what has arrived, not what is on its way', async () => {
    const { received } = await exportLetters(db, 'ann', FRIDAY)

    expect(received).toEqual([
      {
        id: FROM_BOB,
        correspondenceId: 'pair',
        inReplyTo: null,
        hasPhoto: false,
        ciphertext: CIPHERTEXT,
        wrappedKey: 'key-for-ann',
        kind: 'letter',
        postmark: '2026-11-16',
        arrivedOn: '2026-11-20',
        openedAt: null,
      },
    ])
    expect(JSON.stringify(await exportLetters(db, 'ann', FRIDAY))).not.toContain(SECOND_FROM_BOB)
  })

  it("shows the recipient their own opening, and nobody else's letters", async () => {
    const bob = await exportLetters(db, 'bob', FRIDAY)

    expect(bob.received).toHaveLength(1)
    expect(bob.received[0]).toMatchObject({ id: FROM_ANN, openedAt: FRIDAY.toISOString() })
    expect(bob.written.map((letter) => letter.id).toSorted()).toEqual(
      [FROM_BOB, SECOND_FROM_BOB].toSorted(),
    )
    expect(JSON.stringify(bob)).not.toContain(DRAFT)
  })
})

describe('the post section', () => {
  it('holds the city, the mail days and the notices', async () => {
    await db.insert(notices).values({ userId: 'ann', mailDate: '2026-11-20', state: 'sent' })
    const data = await exportPost(db, 'ann')

    expect(data.profile).toMatchObject({
      city: 'Chicago',
      country: 'US',
      timeZone: 'America/Chicago',
      mailDays: [1, 2, 3, 4, 5, 6],
      deliveryHour: 10,
      pending: null,
    })
    expect(data.notices).toEqual([
      { mailDate: '2026-11-20', channel: 'email', state: 'sent', sentAt: null },
    ])
    expect((await exportPost(db, 'nobody')).profile).toBeNull()
  })
})

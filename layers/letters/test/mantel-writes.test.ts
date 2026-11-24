// A child's mantel against a real D1: its keepers set how letters to it may
// open, and one of them writes back as the mantel, to the people who write.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { closeCorrespondence } from '../server/utils/closing'
import { openMantelCorrespondence } from '../server/utils/correspondences'
import { ownLetter, saveDraft } from '../server/utils/drafts'
import { listKeptArchive, readKeptForArchive } from '../server/utils/kept-archive'
import { listKeptMantel, openKeptLetter } from '../server/utils/kept-mantel'
import { countSent } from '../server/utils/kept-sent'
import { listMantel, openLetter } from '../server/utils/mantel'
import { mantelOutbox, writingAs } from '../server/utils/mantel-author'
import { openingsView, setMantelOpenings } from '../server/utils/openings'
import { listDesk, planSeal, recallLetter, sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  people,
  userKeys,
  postalProfiles,
  mantels,
  mantelKeepers,
  mantelOpenings,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
} = schema

const LEO = 'aaaaaaaa-0000-4000-8000-000000000001'
const PIP = 'aaaaaaaa-0000-4000-8000-000000000002'
const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T18:00:00Z')
const BIRTHDAY = '2044-06-14'
const THIRTEEN = '2039-06-14'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}
const letterId = (n: number) => `4b0f6c1e-0d3a-4c1f-9e57-${String(n).padStart(12, '0')}`

let annToLeo = ''
let eveToLeo = ''

async function draft(author: string, id: string, correspondenceId: string, extra = {}) {
  return saveDraft(
    db,
    author,
    { id, correspondenceId, ciphertext: CIPHERTEXT, wrappedKey: `key-for-${author}`, ...extra },
    MONDAY,
  )
}

async function toLeo(id: string, opensOn: string | null = null) {
  await draft('eve', id, eveToLeo)
  return sealLetter(db, 'eve', id, 'key-for-leo', MONDAY, opensOn, false, { [LEO]: 'leo-key' })
}

// Only what is still on its way: a delivery that went back stays returned.
const deliverAll = () =>
  db
    .update(deliveries)
    .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20' })
    .where(eq(deliveries.state, 'in_transit'))

beforeEach(async () => {
  for (const table of [
    mantelOpenings,
    deliveries,
    letterKeys,
    letters,
    correspondenceMembers,
    correspondences,
    mantelKeepers,
    mantels,
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
    await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
  }
  await db.insert(people).values([
    { userId: 'ann', displayName: 'Ann Lee' },
    { userId: 'eve', displayName: 'Granny Eve' },
  ])
  await db.insert(mantels).values([
    { id: LEO, kind: 'child', name: 'Leo', publicKey: 'leo-key' },
    { id: PIP, kind: 'anniversary', name: 'Pip and Sam', publicKey: 'pip-key' },
  ])
  await db.insert(mantelKeepers).values([
    { mantelId: LEO, userId: 'ann', role: 'guardian' },
    { mantelId: LEO, userId: 'bob', role: 'guardian' },
    { mantelId: PIP, userId: 'ann', role: 'partner' },
  ])
  await db.insert(postalProfiles).values({ userId: LEO, ...CHICAGO })
  annToLeo = (await openMantelCorrespondence(db, 'ann', LEO, MONDAY))!
  // Granny Eve, a writer the keepers invited.
  eveToLeo = crypto.randomUUID()
  await db.insert(correspondences).values({ id: eveToLeo, mantelId: LEO })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: eveToLeo, userId: 'eve' },
    { correspondenceId: eveToLeo, userId: LEO },
  ])
})

describe('how letters to the mantel open', () => {
  it('opens on arrival until the keepers say otherwise', async () => {
    expect(await planSeal(db, 'eve', eveToLeo, MONDAY)).toMatchObject({
      openings: { onArrival: true, days: [] },
    })
    expect((await toLeo(letterId(1), BIRTHDAY)).status).toBe('cannot-seal-until')
    expect((await toLeo(letterId(2))).status).toBe('sealed')
  })

  it('is set by any one keeper, and by nobody else', async () => {
    const days = [
      { on: BIRTHDAY, label: '18th birthday' },
      { on: THIRTEEN, label: '13th birthday' },
      { on: THIRTEEN, label: 'twice' },
    ]
    expect(await setMantelOpenings(db, 'eve', LEO, { onArrival: true, days }, MONDAY)).toBe(
      'not-keeper',
    )
    expect(await setMantelOpenings(db, 'bob', LEO, { onArrival: false, days }, MONDAY)).toBe(
      'changed',
    )
    expect(await openingsView(db, 'eve', LEO)).toBeNull()
    // One per day, earliest first; bob has no chosen name, so his account's.
    expect(await openingsView(db, 'ann', LEO)).toMatchObject({
      onArrival: false,
      days: [
        { on: THIRTEEN, label: 'twice' },
        { on: BIRTHDAY, label: '18th birthday' },
      ],
      changedBy: 'bob',
    })
  })

  it('leaves at least one way, and only days to come within a lifetime', async () => {
    const set = (onArrival: boolean, on?: string) =>
      setMantelOpenings(db, 'ann', LEO, { onArrival, days: on ? [{ on, label: '' }] : [] }, MONDAY)
    expect(await set(false)).toBe('no-choice')
    expect(await set(true, '2026-11-16')).toBe('bad-day')
    expect(await set(true, '2200-01-01')).toBe('bad-day')
    expect(await set(false, BIRTHDAY)).toBe('changed')
  })

  it('lets the writer choose only among what the keepers allow', async () => {
    await setMantelOpenings(
      db,
      'ann',
      LEO,
      { onArrival: false, days: [{ on: BIRTHDAY, label: '' }] },
      MONDAY,
    )
    expect((await toLeo(letterId(1))).status).toBe('cannot-seal-until')
    expect((await toLeo(letterId(2), THIRTEEN)).status).toBe('cannot-seal-until')
    expect((await toLeo(letterId(3), BIRTHDAY)).status).toBe('sealed')
    // A change applies to letters sealed after it.
    await setMantelOpenings(db, 'ann', LEO, { onArrival: true, days: [] }, MONDAY)
    expect(
      (
        await db
          .select()
          .from(letters)
          .where(eq(letters.id, letterId(3)))
      )[0]?.opensOn,
    ).toBe(BIRTHDAY)
  })

  it('has nothing to offer once every day has passed', async () => {
    await db
      .insert(mantelOpenings)
      .values({ mantelId: LEO, onArrival: false, days: [{ on: '2026-11-01', label: '' }] })
    expect(await planSeal(db, 'eve', eveToLeo, MONDAY)).toBe('no-opening')
  })
})

describe('the mantel writing back', () => {
  it('is done by a keeper of a child’s mantel, as the mantel', async () => {
    expect(await writingAs(db, 'ann', LEO)).toBe(LEO)
    expect(await writingAs(db, 'eve', LEO)).toBeNull()
    expect(await writingAs(db, 'ann', PIP)).toBeNull()
    expect(await writingAs(db, 'eve')).toBe('eve')
    expect(await mantelOutbox(db, 'eve', LEO, MONDAY)).toBeNull()
    const outbox = (await mantelOutbox(db, 'bob', LEO, MONDAY))!
    expect(outbox.people.map((person) => person.name).toSorted()).toEqual(['Ann Lee', 'Granny Eve'])
  })

  it('keeps the draft under the mantel’s key, for every keeper', async () => {
    expect(await draft(LEO, letterId(1), eveToLeo, { authorKey: 'old-key' })).toBe('key-changed')
    expect(await db.select().from(letters)).toEqual([])
    expect(await draft(LEO, letterId(1), eveToLeo, { authorKey: 'leo-key' })).toBe('saved')
    expect(await ownLetter(db, LEO, letterId(1))).toMatchObject({
      wrappedKey: 'key-for-aaaaaaaa-0000-4000-8000-000000000001',
    })
    // Held under the mantel's id, where a re-key's plan finds every key to move.
    expect(await db.select().from(letterKeys)).toMatchObject([
      { letterId: letterId(1), userId: LEO },
    ])
  })

  it('posts from the mantel, and the writer sees only what any sender sees', async () => {
    await draft(LEO, letterId(1), eveToLeo, { authorKey: 'leo-key' })
    expect(await planSeal(db, LEO, eveToLeo, MONDAY)).toMatchObject({
      recipientId: 'eve',
      toMantel: false,
      openings: null,
      senderZone: 'America/Chicago',
    })
    // A letter from the mantel to a person is not sealed until a day.
    expect((await sealLetter(db, LEO, letterId(1), 'k-eve', MONDAY, BIRTHDAY)).status).toBe(
      'cannot-seal-until',
    )
    expect((await sealLetter(db, LEO, letterId(1), 'k-eve', MONDAY)).status).toBe('sealed')
    expect((await listDesk(db, LEO, MONDAY)).letters).toMatchObject([
      { to: 'Granny Eve', status: { kind: 'awaiting_pickup' } },
    ])
    expect(await recallLetter(db, LEO, letterId(1), MONDAY)).toBe('recalled')
    expect(await db.select().from(letterKeys)).toMatchObject([{ userId: LEO }])
  })

  it('arrives as a letter from the child, which can be answered', async () => {
    await draft(LEO, letterId(1), eveToLeo, { authorKey: 'leo-key' })
    await sealLetter(db, LEO, letterId(1), 'k-eve', MONDAY)
    await deliverAll()
    expect(await listMantel(db, 'eve')).toMatchObject([{ letterId: letterId(1), name: 'Leo' }])
    expect(await openLetter(db, 'eve', letterId(1), FRIDAY)).toMatchObject({
      name: 'Leo',
      canReply: true,
    })
  })

  it('answers a letter that has arrived and opened, never one still sealed', async () => {
    await setMantelOpenings(
      db,
      'ann',
      LEO,
      { onArrival: true, days: [{ on: BIRTHDAY, label: '' }] },
      MONDAY,
    )
    await toLeo(letterId(1))
    await toLeo(letterId(2), BIRTHDAY)
    await deliverAll()
    const opened = await openKeptLetter(db, 'ann', LEO, letterId(1), FRIDAY)
    expect(opened).toMatchObject({ sealed: false, answerIn: eveToLeo })
    const reply = (n: number, to: number) =>
      draft(LEO, letterId(n), eveToLeo, { authorKey: 'leo-key', inReplyTo: letterId(to) })
    expect(await reply(3, 2)).toBe('not-received')
    expect(await reply(4, 1)).toBe('saved')
  })

  it('comes back to the mantel’s page when it cannot be delivered', async () => {
    await draft(LEO, letterId(1), eveToLeo, { authorKey: 'leo-key' })
    await sealLetter(db, LEO, letterId(1), 'k-eve', MONDAY)
    expect(await closeCorrespondence(db, 'eve', eveToLeo, MONDAY)).toBe('closed')
    // Nothing shows before the return's own release, like any post.
    expect(await listKeptMantel(db, 'ann', LEO, FRIDAY)).toEqual([])
    await deliverAll()
    expect(await listKeptMantel(db, 'eve', LEO, FRIDAY)).toBeNull()
    expect(await listKeptMantel(db, 'bob', LEO, FRIDAY)).toMatchObject([
      { letterId: letterId(1), kind: 'return', name: 'Granny Eve', opened: false, sealed: false },
    ])
    expect(await openKeptLetter(db, 'eve', LEO, letterId(1), FRIDAY)).toBeNull()
    // Opened with the mantel's own copy of the key, and not to be answered.
    expect(await openKeptLetter(db, 'bob', LEO, letterId(1), FRIDAY)).toMatchObject({
      sealed: false,
      kind: 'return',
      name: 'Granny Eve',
      wrappedKey: `key-for-${LEO}`,
      answerIn: null,
    })
    expect(await listKeptMantel(db, 'ann', LEO, FRIDAY)).toMatchObject([{ opened: true }])
    expect(await listMantel(db, 'eve')).toEqual([])
  })

  it('does not write in a keeper’s place where it is not a member', async () => {
    const pair = crypto.randomUUID()
    await db.insert(correspondences).values({ id: pair })
    await db.insert(correspondenceMembers).values([
      { correspondenceId: pair, userId: 'ann' },
      { correspondenceId: pair, userId: 'eve' },
    ])
    expect(await draft(LEO, letterId(1), pair, { authorKey: 'leo-key' })).toBe('closed')
    expect(await planSeal(db, LEO, annToLeo, MONDAY)).toMatchObject({ recipientId: 'ann' })
  })
})

describe('a keeper’s copy of a mantel that writes', () => {
  beforeEach(async () => {
    await toLeo(letterId(1))
    await draft(LEO, letterId(2), eveToLeo, { authorKey: 'leo-key' })
    await sealLetter(db, LEO, letterId(2), 'k-eve', MONDAY)
    await draft(LEO, letterId(3), annToLeo, { authorKey: 'leo-key' })
    await db
      .update(letters)
      .set({ postmarkDate: '2026-11-16' })
      .where(eq(letters.id, letterId(1)))
    await db
      .update(letters)
      .set({ postmarkDate: '2026-11-17' })
      .where(eq(letters.id, letterId(2)))
    await deliverAll()
    await openKeptLetter(db, 'ann', LEO, letterId(1), FRIDAY)
  })

  it('holds what the mantel wrote beside what it received, never a draft', async () => {
    expect(await countSent(db, LEO)).toBe(1)
    expect((await listKeptArchive(db, 'bob', LEO, FRIDAY))!.entries).toEqual([
      {
        id: letterId(1),
        direction: 'received',
        from: 'Granny Eve',
        postmark: '2026-11-16',
        guest: false,
      },
      { id: letterId(2), direction: 'sent', from: null, postmark: '2026-11-17', to: 'Granny Eve' },
    ])
    expect(await readKeptForArchive(db, 'bob', LEO, letterId(2), FRIDAY)).toEqual({
      ciphertext: CIPHERTEXT,
      wrappedKey: `key-for-${LEO}`,
      hasPhoto: false,
    })
    expect(await readKeptForArchive(db, 'bob', LEO, letterId(3), FRIDAY)).toBeNull()
    expect(await readKeptForArchive(db, 'eve', LEO, letterId(2), FRIDAY)).toBeNull()
    expect(await listKeptArchive(db, 'eve', LEO, FRIDAY)).toBeNull()
  })

  it('holds a letter that came back once, as one the mantel wrote', async () => {
    await draft(LEO, letterId(4), eveToLeo, { authorKey: 'leo-key' })
    await sealLetter(db, LEO, letterId(4), 'k-eve', FRIDAY)
    await closeCorrespondence(db, 'eve', eveToLeo, FRIDAY)
    await deliverAll()
    const entries = (await listKeptArchive(db, 'ann', LEO, FRIDAY))!.entries
    expect(entries.filter((entry) => entry.id === letterId(4))).toMatchObject([
      { direction: 'sent', to: 'Granny Eve' },
    ])
  })
})

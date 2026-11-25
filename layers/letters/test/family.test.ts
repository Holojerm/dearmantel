// Families against a real D1: a letter to a family is one letter with a copy
// of its key for each reader, each copy on that reader's own post; joining,
// leaving and deleting an account change who reads what comes next, never
// what was already sent.

import { env } from 'cloudflare:test'
import type { BatchItem } from 'drizzle-orm/batch'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { clearExtensionsForTest, getAccountContributors } from '#server/utils/extensions'

import { acceptInvite } from '../server/utils/accept-invite'
import { closeCorrespondence } from '../server/utils/closing'
import { listPeople } from '../server/utils/correspondences'
import { saveDraft } from '../server/utils/drafts'
import {
  closeFamily,
  createFamily,
  familiesForRoom,
  familyMembersForRoom,
  getFamily,
  leaveFamily,
  listFamilies,
  renameFamily,
} from '../server/utils/families'
import { inviteEmail } from '../server/utils/invite-email'
import { createInvite, viewInvite } from '../server/utils/invites'
import { registerLettersExtensions } from '../server/utils/letters-extensions'
import { listMantel, openLetter } from '../server/utils/mantel'
import { listDesk, planSeal, recallLetter, sealLetter } from '../server/utils/posting'
import { FAMILY_MEMBERS_MAX } from '../shared/utils/invites'

const db = drizzle(env.DB, { schema })
const {
  users,
  people,
  userKeys,
  postalProfiles,
  families,
  invites,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
} = schema

const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T18:00:00Z')
const LETTER = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const SECOND = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CITY = {
  chicago: {
    cityName: 'Chicago',
    country: 'US',
    lat: 41.85,
    lng: -87.65,
    timeZone: 'America/Chicago',
  },
  tokyo: { cityName: 'Tokyo', country: 'JP', lat: 35.69, lng: 139.69, timeZone: 'Asia/Tokyo' },
}
const ann = { id: 'ann', email: 'ann@example.com' }

let familyId = ''
let toFamily = ''

async function join(who: string) {
  const invite = await createInvite(db, ann, `${who}@example.com`, MONDAY, null, familyId)
  if (invite.status !== 'created') throw new Error(invite.status)
  const accepted = await acceptInvite(db, invite.token, who, MONDAY)
  if (accepted.status !== 'accepted') throw new Error(accepted.status)
  return accepted.correspondenceId
}
const draft = (id: string, author = 'ann') =>
  saveDraft(
    db,
    author,
    { id, correspondenceId: toFamily, ciphertext: CIPHERTEXT, wrappedKey: `key-for-${author}` },
    MONDAY,
  )
const readers = async () =>
  (await db.select().from(letterKeys).where(eq(letterKeys.letterId, LETTER)))
    .map((row) => row.userId)
    .toSorted()

beforeEach(async () => {
  clearExtensionsForTest()
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    invites,
    families,
    correspondenceMembers,
    correspondences,
    postalProfiles,
    userKeys,
    people,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const [id, name, city] of [
    ['ann', 'Ann Lee', CITY.chicago],
    ['bob', 'Bob Lee', CITY.chicago],
    ['cal', 'Cal Lee', CITY.tokyo],
    ['eve', 'Eve Stone', CITY.chicago],
  ] as const) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({ userId: id, ...city })
    await db.insert(people).values({ userId: id, displayName: name })
  }
  const made = await createFamily(db, 'ann', 'The Lees', MONDAY)
  if (made.status !== 'created') throw new Error(made.status)
  familyId = made.id
  toFamily = (await getFamily(db, 'ann', familyId, MONDAY))!.correspondenceId
})

describe('a family', () => {
  it('starts with its organiser, under a name that is safe to print', async () => {
    expect((await createFamily(db, 'ann', 'visit evil.example', MONDAY)).status).toBe('bad-name')
    expect(await listFamilies(db, 'ann')).toMatchObject([{ name: 'The Lees' }])
    expect(await getFamily(db, 'ann', familyId, MONDAY)).toMatchObject({
      organiserId: 'ann',
      members: [{ userId: 'ann', name: 'Ann Lee' }],
    })
    expect(await getFamily(db, 'bob', familyId, MONDAY)).toBeNull()
    // Nobody to write to yet.
    expect(await planSeal(db, 'ann', toFamily, MONDAY)).toBe('closed')
  })

  it('is joined by invitation from its organiser only', async () => {
    await join('bob')
    expect(
      await createInvite(
        db,
        { id: 'bob', email: 'bob@example.com' },
        'cal@example.com',
        MONDAY,
        null,
        familyId,
      ),
    ).toEqual({ status: 'not-organiser' })
    expect((await createInvite(db, ann, 'bob@example.com', MONDAY, null, familyId)).status).toBe(
      'already-writing',
    )

    const invite = await createInvite(db, ann, 'cal@example.com', MONDAY, null, familyId)
    if (invite.status !== 'created') throw new Error(invite.status)
    expect(await viewInvite(db, invite.token, MONDAY)).toMatchObject({ familyName: 'The Lees' })
    const mail = inviteEmail(
      { appName: 'Dear Mantel', appUrl: 'https://dearmantel.com' },
      { inviterName: 'Ann Lee', token: invite.token, familyName: 'The Lees' },
    )
    expect(mail.subject).toBe('Ann Lee invites you to The Lees')
    expect((await getFamily(db, 'ann', familyId, MONDAY))!.invited).toMatchObject([
      { email: 'cal@example.com' },
    ])

    expect((await acceptInvite(db, invite.token, 'cal', MONDAY)).status).toBe('accepted')
    const family = (await getFamily(db, 'cal', familyId, MONDAY))!
    expect(family.members.map((member) => member.name)).toEqual(['Ann Lee', 'Bob Lee', 'Cal Lee'])
    // A family is not a person: it is not among the people someone writes with.
    expect((await listPeople(db, 'cal', MONDAY)).people).toEqual([])
    expect(FAMILY_MEMBERS_MAX).toBeGreaterThan(3)
  })
})

describe('a letter to the family', () => {
  beforeEach(async () => {
    await join('bob')
    await join('cal')
    await draft(LETTER)
  })

  it('plans a copy for each reader, each on their own post', async () => {
    const plan = await planSeal(db, 'ann', toFamily, MONDAY)
    if (typeof plan === 'string') throw new Error(plan)

    expect(plan.family).toBe('The Lees')
    expect(plan.recipients.map((reader) => reader.id).toSorted()).toEqual(['bob', 'cal'])
    const bob = plan.recipients.find((reader) => reader.id === 'bob')!
    const cal = plan.recipients.find((reader) => reader.id === 'cal')!
    expect(bob.publicKey).toBe('public-key-of-bob')
    // Tokyo is further from Chicago than Chicago is.
    expect(cal.posting.promisedDate > bob.posting.promisedDate).toBe(true)
    expect(plan.lastArrival).toBe(cal.posting.promisedDate)
  })

  it('needs a wrapped key for every reader and no one else', async () => {
    expect((await sealLetter(db, 'ann', LETTER, 'one-key', MONDAY)).status).toBe('readers-changed')
    expect((await sealLetter(db, 'ann', LETTER, { bob: 'k-bob' }, MONDAY)).status).toBe(
      'readers-changed',
    )
    expect(
      (await sealLetter(db, 'ann', LETTER, { bob: 'k-bob', cal: 'k-cal', eve: 'k-eve' }, MONDAY))
        .status,
    ).toBe('readers-changed')
    expect(
      (await sealLetter(db, 'ann', LETTER, { bob: 'k-bob', cal: 'k-cal' }, MONDAY)).status,
    ).toBe('sealed')

    expect(await readers()).toEqual(['ann', 'bob', 'cal'])
    const copies = await db.select().from(deliveries)
    expect(copies.map((copy) => copy.recipientId).toSorted()).toEqual(['bob', 'cal'])
    expect(new Set(copies.map((copy) => copy.promisedDate)).size).toBe(2)
  })

  // D1 allows 100 bound values in a statement, and a reader's rows bind sixteen.
  it('is sealed whole for a family as large as a family can be', async () => {
    const more = Array.from({ length: FAMILY_MEMBERS_MAX - 3 }, (_, n) => `kin${n}`)
    for (const id of more) {
      await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
      await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
      await db.insert(postalProfiles).values({ userId: id, ...CITY.tokyo })
      await db.insert(people).values({ userId: id, displayName: `Kin ${id}` })
      await join(id)
    }
    const everyone = ['bob', 'cal', ...more]

    const plan = await planSeal(db, 'ann', toFamily, MONDAY)
    if (typeof plan === 'string') throw new Error(plan)
    expect(plan.recipients.map((reader) => reader.id).toSorted()).toEqual(everyone.toSorted())
    expect(plan.recipients.find((reader) => reader.id === 'kin0')).toMatchObject({
      name: 'Kin kin0',
      publicKey: 'public-key-of-kin0',
    })

    const keys = Object.fromEntries(everyone.map((id) => [id, `k-${id}`]))
    expect((await sealLetter(db, 'ann', LETTER, keys, MONDAY)).status).toBe('sealed')
    expect(await readers()).toEqual(['ann', ...everyone].toSorted())
    const copies = await db.select().from(deliveries)
    expect(copies.map((copy) => copy.recipientId).toSorted()).toEqual(everyone.toSorted())

    expect(await recallLetter(db, 'ann', LETTER, MONDAY)).toBe('recalled')
    expect(await db.select().from(deliveries)).toEqual([])
  })

  it('shows the writer one letter, in transit until the last copy is due', async () => {
    await sealLetter(db, 'ann', LETTER, { bob: 'k-bob', cal: 'k-cal' }, MONDAY)
    const copies = await db.select().from(deliveries)
    const last = copies
      .map((copy) => copy.promisedDate)
      .toSorted()
      .at(-1)!

    const desk = (await listDesk(db, 'ann', new Date('2026-11-17T23:30:00Z'))).letters
    expect(desk).toHaveLength(1)
    expect(desk[0]).toMatchObject({ to: 'The Lees', status: { kind: 'in_transit', arrives: last } })
  })

  it('reaches each reader on their own mantel, and no reader learns of another', async () => {
    await sealLetter(db, 'ann', LETTER, { bob: 'k-bob', cal: 'k-cal' }, MONDAY)
    await db
      .update(deliveries)
      .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20' })
      .where(eq(deliveries.recipientId, 'bob'))

    expect(await listMantel(db, 'bob', FRIDAY)).toMatchObject([{ name: 'Ann Lee' }])
    expect(await openLetter(db, 'bob', LETTER, FRIDAY)).toMatchObject({ wrappedKey: 'k-bob' })
    expect(await listMantel(db, 'cal', FRIDAY)).toEqual([])
    expect(await openLetter(db, 'cal', LETTER, FRIDAY)).toBeNull()
    const calCopy = (await db.select().from(deliveries)).find((copy) => copy.recipientId === 'cal')
    expect(calCopy?.openedAt).toBeNull()
  })

  it('is recalled whole before pickup', async () => {
    await sealLetter(db, 'ann', LETTER, { bob: 'k-bob', cal: 'k-cal' }, MONDAY)
    expect(await recallLetter(db, 'ann', LETTER, MONDAY)).toBe('recalled')
    expect(await db.select().from(deliveries)).toEqual([])
    expect(await readers()).toEqual(['ann'])
  })
})

describe('leaving a family', () => {
  beforeEach(async () => {
    await join('bob')
    await join('cal')
    await draft(LETTER)
    await sealLetter(db, 'ann', LETTER, { bob: 'k-bob', cal: 'k-cal' }, MONDAY)
  })

  it('ends one place in it: their copy on the way goes back, the family goes on', async () => {
    expect(await leaveFamily(db, 'eve', familyId, 'eve', FRIDAY)).toBe('not-a-member')
    expect(await leaveFamily(db, 'bob', familyId, 'cal', FRIDAY)).toBe('not-organiser')
    expect(await leaveFamily(db, 'cal', familyId, 'cal', FRIDAY)).toBe('left')

    const copies = await db.select().from(deliveries)
    expect(copies.find((c) => c.recipientId === 'cal' && c.kind === 'letter')?.state).toBe(
      'returned',
    )
    expect(copies.find((c) => c.recipientId === 'bob')?.state).toBe('in_transit')
    expect(await getFamily(db, 'cal', familyId, FRIDAY)).toBeNull()

    await draft(SECOND)
    const plan = await planSeal(db, 'ann', toFamily, FRIDAY)
    if (typeof plan === 'string') throw new Error(plan)
    expect(plan.recipients.map((reader) => reader.id)).toEqual(['bob'])
  })

  it('can be done to a member by the organiser, and a family is never closed by one member', async () => {
    expect(await leaveFamily(db, 'ann', familyId, 'bob', FRIDAY)).toBe('left')
    expect(await closeCorrespondence(db, 'cal', toFamily, FRIDAY)).toBe('not-yours')
    expect((await getFamily(db, 'cal', familyId, FRIDAY))!.members).toHaveLength(2)
  })

  it('passes the organising to whoever has been in it longest', async () => {
    await leaveFamily(db, 'ann', familyId, 'ann', FRIDAY)
    expect(await getFamily(db, 'bob', familyId, FRIDAY)).toMatchObject({ organiserId: 'bob' })
  })

  it('survives a member deleting their account', async () => {
    registerLettersExtensions()
    const contributor = getAccountContributors().find((c) => c.key === 'letters')!
    await contributor.beforeDeletion!(db, 'cal')
    const statements = contributor.deletionStatements!(db, 'cal') as BatchItem<'sqlite'>[]
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

    const [correspondence] = await db
      .select()
      .from(correspondences)
      .where(eq(correspondences.id, toFamily))
    expect(correspondence?.closedAt).toBeNull()
    expect((await getFamily(db, 'ann', familyId, FRIDAY))!.members.map((m) => m.userId)).toEqual([
      'ann',
      'bob',
    ])
  })
})

describe('the organiser', () => {
  beforeEach(async () => {
    await join('bob')
    await join('cal')
  })

  it('renames the family, and nobody else does', async () => {
    expect(await renameFamily(db, 'bob', familyId, 'The Stones', FRIDAY)).toBe('not-organiser')
    expect(await renameFamily(db, 'ann', familyId, '   ', FRIDAY)).toBe('bad-name')
    expect(await renameFamily(db, 'ann', familyId, '  The   Lees ', FRIDAY)).toBe('done')
    expect((await getFamily(db, 'bob', familyId, FRIDAY))!.name).toBe('The Lees')
  })

  it('closes it for everyone: letters on the way go back, invitations are withdrawn', async () => {
    await draft(LETTER)
    await sealLetter(db, 'ann', LETTER, { bob: 'k-bob', cal: 'k-cal' }, MONDAY)
    await createInvite(db, ann, 'dan@example.com', MONDAY, null, familyId)

    expect(await closeFamily(db, 'bob', familyId, FRIDAY)).toBe('not-organiser')
    expect(await closeFamily(db, 'ann', familyId, FRIDAY)).toBe('done')

    const copies = await db.select().from(deliveries)
    expect(
      copies
        .filter((copy) => copy.kind === 'letter')
        .map((copy) => copy.state)
        .toSorted(),
    ).toEqual(['returned', 'returned'])
    expect(await db.select().from(invites).where(eq(invites.familyId, familyId))).toHaveLength(2)
    expect(await listFamilies(db, 'bob')).toEqual([])
    await draft(SECOND)
    expect(await planSeal(db, 'ann', toFamily, FRIDAY)).toBe('closed')
    expect(await closeFamily(db, 'ann', familyId, FRIDAY)).toBe('not-organiser')
    expect(await renameFamily(db, 'ann', familyId, 'Again', FRIDAY)).toBe('not-organiser')
  })
})

describe('what the family room is told', () => {
  it('is who is in a family now, whether it is closed, and who organises it', async () => {
    await join('bob')
    await join('cal')
    expect(await familiesForRoom(db, 'bob', familyId)).toEqual([
      { id: familyId, name: expect.any(String), closed: false, organiser: false },
    ])
    expect((await familiesForRoom(db, 'ann'))[0]).toMatchObject({ organiser: true })
    expect(await familiesForRoom(db, 'eve', familyId)).toEqual([])

    expect((await familyMembersForRoom(db, familyId)).map((member) => member.id)).toEqual([
      'ann',
      'bob',
      'cal',
    ])
    await leaveFamily(db, 'cal', familyId, 'cal', FRIDAY)
    expect(await familiesForRoom(db, 'cal')).toEqual([])
    expect(await familyMembersForRoom(db, familyId)).toHaveLength(2)
    await closeFamily(db, 'ann', familyId, FRIDAY)
    expect(await familiesForRoom(db, 'bob')).toMatchObject([{ closed: true }])
  })
})

// News of a child against a real D1: only its keepers write it, people join
// by a keeper's invitation, the child's mantel gets a copy when the writer
// says so, nobody answers it, and a reader is never told who else reads.

import { env } from 'cloudflare:test'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { acceptInvite } from '../server/utils/accept-invite'
import { listArchive } from '../server/utils/archive'
import { listPeople } from '../server/utils/correspondences'
import { saveDraft } from '../server/utils/drafts'
import { inviteEmail } from '../server/utils/invite-email'
import { createInvite, viewInvite } from '../server/utils/invites'
import { listKeptMantel } from '../server/utils/kept-mantel'
import { listMantel, openLetter } from '../server/utils/mantel'
import {
  leaveNews,
  listNewsFor,
  listNewsReaders,
  NEWS_READERS_MAX,
  openNews,
  removeNewsReader,
} from '../server/utils/news'
import { listDesk, planSeal, sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  people,
  userKeys,
  postalProfiles,
  mantels,
  mantelKeepers,
  mantelNews,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
  invites,
} = schema

const LEO = 'aaaaaaaa-0000-4000-8000-000000000001'
// Which key a copy for the mantel was wrapped to: sealing checks it is still the mantel's.
const TO_LEO = { [LEO]: 'leo-key' }
const PIP = 'bbbbbbbb-0000-4000-8000-000000000002'
const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T18:00:00Z')
const FIRST = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const SECOND = '9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}

let news = ''

/** Eve and Dan are invited by Ann and accept. */
async function invite(reader: string, by = 'ann') {
  const made = await createInvite(
    db,
    { id: by, email: `${by}@example.com` },
    `${reader}@example.com`,
    MONDAY,
    LEO,
    null,
    true,
  )
  if (made.status !== 'created') throw new Error(made.status)
  return made
}
const join = async (reader: string) =>
  acceptInvite(db, (await invite(reader)).token, reader, MONDAY)

async function write(id: string, readers: string[], withChild = false, author = 'ann') {
  await saveDraft(
    db,
    author,
    { id, correspondenceId: news, ciphertext: CIPHERTEXT, wrappedKey: `key-for-${author}` },
    MONDAY,
  )
  return sealLetter(
    db,
    author,
    id,
    Object.fromEntries(readers.map((reader) => [reader, `key-for-${reader}`])),
    MONDAY,
    null,
    withChild,
    TO_LEO,
  )
}
const deliver = () =>
  db.update(deliveries).set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: '2026-11-20' })

beforeEach(async () => {
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    invites,
    mantelNews,
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
  for (const id of ['ann', 'bob', 'eve', 'dan']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
    await db.insert(people).values({ userId: id, displayName: `${id} Lee` })
  }
  await db.insert(mantels).values([
    { id: LEO, kind: 'child', name: 'Leo', publicKey: 'leo-key' },
    { id: PIP, kind: 'anniversary', name: 'Pip and Sam', publicKey: 'pip-key' },
  ])
  await db.insert(mantelKeepers).values([
    { mantelId: LEO, userId: 'ann', role: 'guardian' },
    { mantelId: LEO, userId: 'bob', role: 'guardian' },
    { mantelId: PIP, userId: 'ann', role: 'guardian' },
  ])
  await db.insert(postalProfiles).values({ userId: LEO, ...CHICAGO })
  news = (await openNews(db, 'ann', LEO, MONDAY))!
})

describe('a child’s news', () => {
  it('belongs to a child’s mantel and is opened by its keepers only', async () => {
    expect(await openNews(db, 'bob', LEO, MONDAY)).toBe(news)
    expect(await openNews(db, 'eve', LEO, MONDAY)).toBeNull()
    expect(await openNews(db, 'ann', PIP, MONDAY)).toBeNull()
    await db.update(mantels).set({ closedAt: MONDAY }).where(eq(mantels.id, LEO))
    expect(await openNews(db, 'ann', LEO, MONDAY)).toBeNull()
  })

  it('is joined by a keeper’s invitation, which says what it is', async () => {
    const made = await invite('eve')
    expect(made).toMatchObject({ news: true, mantelName: 'Leo' })
    expect(await viewInvite(db, made.token, MONDAY)).toMatchObject({
      status: 'open',
      mantelName: 'Leo',
      news: true,
    })
    const email = inviteEmail(
      { appName: 'Dear Mantel', appUrl: 'https://example.test', supportEmail: 's@example.test' },
      made,
    )
    expect(email.subject).toBe('ann Lee would like to send you news of Leo')
    expect(await acceptInvite(db, made.token, 'eve', MONDAY)).toEqual({
      status: 'accepted',
      correspondenceId: news,
      kind: 'news',
      familyId: null,
    })
    // Not someone a non-keeper can ask, and not a second time while one waits.
    expect(
      (
        await createInvite(
          db,
          { id: 'eve', email: 'eve@example.com' },
          'dan@example.com',
          MONDAY,
          LEO,
          null,
          true,
        )
      ).status,
    ).toBe('not-keeper')
    await invite('dan')
    expect(
      (
        await createInvite(
          db,
          { id: 'ann', email: 'ann@example.com' },
          'dan@example.com',
          MONDAY,
          LEO,
          null,
          true,
        )
      ).status,
    ).toBe('pending')
    expect(
      (
        await createInvite(
          db,
          { id: 'ann', email: 'ann@example.com' },
          'eve@example.com',
          MONDAY,
          LEO,
          null,
          true,
        )
      ).status,
    ).toBe('already-writing')
    // An invitation to write to the mantel is a different thing and still open to her.
    expect(
      (
        await createInvite(
          db,
          { id: 'ann', email: 'ann@example.com' },
          'eve@example.com',
          MONDAY,
          LEO,
        )
      ).status,
    ).toBe('created')
  })

  it('goes to every reader and the other keeper, and to the child only when asked', async () => {
    await join('eve')
    const plan = await planSeal(db, 'ann', news, MONDAY)
    expect(plan).toMatchObject({ news: 'Leo', withChild: false, toMantel: false, family: null })
    expect(typeof plan === 'object' && plan.recipients.map((r) => r.id).toSorted()).toEqual([
      'bob',
      'eve',
    ])
    const withChild = await planSeal(db, 'ann', news, MONDAY, true)
    expect(typeof withChild === 'object' && withChild.recipients.map((r) => r.id)).toContain(LEO)
    expect(withChild).toMatchObject({ withChild: true, toMantel: false })

    // What the browser wrapped for must be who is planned.
    expect((await write(FIRST, ['bob', 'eve'], true)).status).toBe('readers-changed')
    expect((await write(FIRST, ['bob', 'eve', LEO], true)).status).toBe('sealed')
    expect((await write(SECOND, ['bob', 'eve'])).status).toBe('sealed')
    const copies = await db.select().from(deliveries)
    expect(
      copies
        .filter((c) => c.letterId === FIRST)
        .map((c) => c.recipientId)
        .toSorted(),
    ).toEqual([LEO, 'bob', 'eve'].toSorted())
    expect(
      copies
        .filter((c) => c.letterId === SECOND)
        .map((c) => c.recipientId)
        .toSorted(),
    ).toEqual(['bob', 'eve'])
    expect((await listDesk(db, 'ann', MONDAY)).letters[0]).toMatchObject({
      to: 'everyone who gets news of Leo',
    })

    await deliver()
    const arrived = (await listMantel(db, 'eve', FRIDAY)).toSorted((a, b) =>
      a.letterId.localeCompare(b.letterId),
    )
    expect(arrived).toMatchObject([
      { letterId: FIRST, news: 'Leo', name: 'ann Lee' },
      { letterId: SECOND, news: 'Leo', name: 'ann Lee' },
    ])
    // The child's copy stands on the child's mantel, where its keepers see it.
    expect((await listKeptMantel(db, 'bob', LEO, FRIDAY))?.map((row) => row.letterId)).toEqual([
      FIRST,
    ])
  })

  // D1 allows 100 bound values in a statement, and a reader's rows bind sixteen.
  it('goes to as many readers as news can have, the child among them', async () => {
    const many = Array.from({ length: NEWS_READERS_MAX }, (_, n) => `reader${n}`)
    for (const id of many) {
      await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
      await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
      await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
      await db.insert(people).values({ userId: id, displayName: `${id} Lee` })
      expect((await join(id)).status).toBe('accepted')
    }
    // The news is full: one more invitation is accepted by nobody.
    expect((await join('eve')).status).toBe('expired')

    const everyone = ['bob', ...many, LEO]
    expect((await write(FIRST, everyone, true)).status).toBe('sealed')
    const copies = await db.select().from(deliveries)
    expect(copies.map((copy) => copy.recipientId).toSorted()).toEqual(everyone.toSorted())
    expect(await db.select().from(letterKeys)).toHaveLength(everyone.length + 1)
    // A full news is hundreds of sequential writes: about a second here, over five in the
    // Workers Builds gate, where the tests run one file at a time beside the build.
  }, 30_000)

  it('cannot be sealed until a day, and needs someone to go to', async () => {
    await db
      .update(mantelKeepers)
      .set({ leftAt: MONDAY })
      .where(and(eq(mantelKeepers.mantelId, LEO), eq(mantelKeepers.userId, 'bob')))
    await db.delete(correspondenceMembers).where(eq(correspondenceMembers.userId, 'bob'))
    expect(await planSeal(db, 'ann', news, MONDAY)).toBe('no-readers')
    await saveDraft(
      db,
      'ann',
      { id: FIRST, correspondenceId: news, ciphertext: CIPHERTEXT, wrappedKey: 'key-for-ann' },
      MONDAY,
    )
    expect(
      (
        await sealLetter(
          db,
          'ann',
          FIRST,
          { [LEO]: 'key-for-leo' },
          MONDAY,
          '2044-06-14',
          true,
          TO_LEO,
        )
      ).status,
    ).toBe('cannot-seal-until')
    expect(
      (await sealLetter(db, 'ann', FIRST, { [LEO]: 'k' }, MONDAY, null, true, TO_LEO)).status,
    ).toBe('sealed')
  })

  it('is written by keepers and answered by nobody', async () => {
    await join('eve')
    const draft = {
      id: SECOND,
      correspondenceId: news,
      ciphertext: CIPHERTEXT,
      wrappedKey: 'key-for-eve',
    }
    expect(await saveDraft(db, 'eve', draft, MONDAY)).toBe('closed')
    expect(await planSeal(db, 'eve', news, MONDAY)).toBe('closed')
    await write(FIRST, ['bob', 'eve'])
    await deliver()
    expect(await openLetter(db, 'eve', FIRST, FRIDAY)).toMatchObject({
      news: 'Leo',
      name: 'ann Lee',
      canReply: false,
    })
    expect(await saveDraft(db, 'eve', { ...draft, inReplyTo: FIRST }, FRIDAY)).toBe('closed')
    // A keeper does not answer it either: news has no replies.
    expect(await saveDraft(db, 'bob', { ...draft, inReplyTo: FIRST }, FRIDAY)).toBe('closed')
    expect(await saveDraft(db, 'bob', { ...draft, wrappedKey: 'key-for-bob' }, FRIDAY)).toBe(
      'saved',
    )
  })

  it('shows its readers to keepers and to no reader', async () => {
    await join('eve')
    await invite('dan', 'bob')
    expect(await listNewsReaders(db, 'eve', LEO, MONDAY)).toBeNull()
    expect(await listNewsReaders(db, 'ann', LEO, MONDAY)).toMatchObject({
      correspondenceId: news,
      readers: [{ userId: 'eve', name: 'eve Lee' }],
      invites: [{ email: 'dan@example.com', mine: false }],
    })
    // On a reader's own pages it is news of Leo, not a person to write to.
    expect((await listPeople(db, 'eve', MONDAY)).people).toEqual([])
    expect(await listNewsFor(db, 'eve')).toMatchObject([{ mantelId: LEO, name: 'Leo' }])
    expect(await listNewsFor(db, 'ann')).toEqual([])
    await write(FIRST, ['bob', 'eve'])
    await deliver()
    await openLetter(db, 'eve', FIRST, FRIDAY)
    expect(await listArchive(db, 'eve')).toMatchObject([{ kind: 'news', name: 'Leo' }])
  })

  it('stops for a keeper who is removed, unless they were also asked to read', async () => {
    await join('eve')
    expect((await write(FIRST, ['bob', 'eve'])).status).toBe('sealed')
    // Bob stops keeping Leo's mantel. Nothing in custody knows about news.
    await db
      .update(mantelKeepers)
      .set({ leftAt: MONDAY })
      .where(and(eq(mantelKeepers.mantelId, LEO), eq(mantelKeepers.userId, 'bob')))
    const plan = await planSeal(db, 'ann', news, MONDAY)
    expect(typeof plan === 'object' && plan.recipients.map((r) => r.id)).toEqual(['eve'])
    expect((await listNewsReaders(db, 'ann', LEO, MONDAY))?.readers).toMatchObject([
      { userId: 'eve' },
    ])
    // His copy still on its way is gone with his place, and he cannot write.
    expect((await db.select().from(deliveries)).map((copy) => copy.recipientId)).toEqual(['eve'])
    expect(await planSeal(db, 'bob', news, MONDAY)).toBe('closed')
    expect(await listNewsFor(db, 'bob')).toEqual([])
    // Asked as a reader, he reads again, and stays when keepers are next brought in line.
    await join('bob')
    const again = await planSeal(db, 'ann', news, MONDAY)
    expect(typeof again === 'object' && again.recipients.map((r) => r.id).toSorted()).toEqual([
      'bob',
      'eve',
    ])
  })

  it('stops for a reader who leaves or is removed, and drops what was on its way', async () => {
    await join('eve')
    await join('dan')
    await write(FIRST, ['bob', 'eve', 'dan'])
    expect(await leaveNews(db, 'ann', LEO, MONDAY)).toBe('is-keeper')
    expect(await removeNewsReader(db, 'eve', LEO, 'dan', MONDAY)).toBe('not-keeper')
    expect(await removeNewsReader(db, 'ann', LEO, 'bob', MONDAY)).toBe('is-keeper')
    expect(await leaveNews(db, 'eve', LEO, MONDAY)).toBe('done')
    expect(await removeNewsReader(db, 'bob', LEO, 'dan', MONDAY)).toBe('done')
    expect(await leaveNews(db, 'eve', LEO, MONDAY)).toBe('not-a-reader')

    // Their copies are gone, and nothing went back to the writer.
    const copies = await db.select().from(deliveries)
    expect(copies.map((copy) => [copy.recipientId, copy.kind])).toEqual([['bob', 'letter']])
    const keys = await db.select().from(letterKeys)
    expect(keys.map((key) => key.userId).toSorted()).toEqual(['ann', 'bob'])
    expect((await listNewsReaders(db, 'ann', LEO, MONDAY))?.readers).toEqual([])
    expect(await listNewsFor(db, 'eve')).toEqual([])

    // Asked again, she reads again.
    expect((await join('eve')).status).toBe('accepted')
    expect((await listNewsReaders(db, 'ann', LEO, MONDAY))?.readers).toMatchObject([
      { userId: 'eve' },
    ])
  })
})

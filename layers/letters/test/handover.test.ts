// Handing a child's mantel over, against a real D1: the child is invited only
// from the handover day, accepts from their own address, and holds the key
// only once a keeper's browser hands it over. Nothing changes for anyone
// until the last step, which refuses while any letter key lacks the child's
// copy, and then in one batch moves every letter to the child and leaves the
// keepers with nothing the server will serve. Sealed letters stay sealed.

import { env } from 'cloudflare:test'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import {
  acceptHandover,
  giveHandoverKey,
  handoverForKeeper,
  handoversFor,
  handoverToTake,
  nameChild,
} from '#layers/keys/server/utils/handover'
import { dueHandovers, markHandoverSent } from '#layers/keys/server/utils/handover-due'
import { proposeHandoverDate } from '#layers/keys/server/utils/handover-date'
import { voteForProposal } from '#layers/keys/server/utils/custody'
import { getMantel } from '#layers/keys/server/utils/mantels'

import { openMantelCorrespondence } from '../server/utils/correspondences'
import { saveDraft } from '../server/utils/drafts'
import { closeHandover, handoverPlan, stageHandoverKeys } from '../server/utils/handover-letters'
import { listKeptMantel } from '../server/utils/kept-mantel'
import { listMantel, openLetter } from '../server/utils/mantel'
import { planSeal, sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  userKeys,
  people,
  postalProfiles,
  mantels,
  mantelKeepers,
  mantelKeyWraps,
  mantelHandovers,
  mantelProposals,
  mantelVotes,
  mantelOpenings,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
  handoverKeys,
} = schema

const LEO = 'aaaaaaaa-0000-4000-8000-000000000001'
const MONDAY = new Date('2026-11-16T20:00:00Z')
const FRIDAY = new Date('2026-11-20T18:00:00Z')
const HANDOVER_DAY = '2026-11-20'
const BIRTHDAY = '2044-06-14'
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const letterId = (n: number) => `4b0f6c1e-0d3a-4c1f-9e57-${String(n).padStart(12, '0')}`
const forChild = (id: string) => `child-copy-of-${id}`

let eveToLeo = ''

async function toLeo(n: number, opensOn: string | null = null, now = MONDAY) {
  const id = letterId(n)
  await saveDraft(
    db,
    'eve',
    { id, correspondenceId: eveToLeo, ciphertext: CIPHERTEXT, wrappedKey: 'key-for-eve' },
    now,
  )
  return sealLetter(db, 'eve', id, `mantel-copy-of-${id}`, now, opensOn, false, {
    [LEO]: 'leo-mantel-key',
  })
}

const deliverAll = () =>
  db
    .update(deliveries)
    .set({ state: 'delivered', deliveredAt: FRIDAY, mailDate: HANDOVER_DAY })
    .where(eq(deliveries.state, 'in_transit'))

/** Everything up to the child holding the key: named, invited, accepted, given. */
async function readyToTake() {
  await nameChild(db, 'ann', { mantelId: LEO, email: 'Leo@Example.com' }, MONDAY)
  await markHandoverSent(db, LEO, { invited: 'leo@example.com' }, FRIDAY)
  await acceptHandover(db, 'leo', LEO, FRIDAY)
  return giveHandoverKey(
    db,
    'bob',
    { mantelId: LEO, childId: 'leo', wrapped: keeperWrap('leo'), keyVersion: 1 },
    FRIDAY,
  )
}

/** What the child's browser does: every planned key, wrapped again, sent back. */
async function stageAll() {
  for (let plan = await handoverPlan(db, 'leo', LEO); plan?.letterKeys.length;) {
    const letterKeys = plan.letterKeys.map((key) => ({
      letterId: key.letterId,
      wrappedKey: forChild(key.letterId),
    }))
    expect(await stageHandoverKeys(db, 'leo', { mantelId: LEO, letterKeys }, FRIDAY)).toBe('moved')
    plan = await handoverPlan(db, 'leo', LEO)
  }
}

beforeEach(async () => {
  for (const table of [
    handoverKeys,
    mantelHandovers,
    mantelVotes,
    mantelProposals,
    mantelOpenings,
    deliveries,
    letterKeys,
    letters,
    correspondenceMembers,
    correspondences,
    mantelKeyWraps,
    mantelKeepers,
    mantels,
    postalProfiles,
    userKeys,
    people,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'eve', 'leo']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
  }
  await db.insert(people).values({ userId: 'eve', displayName: 'Granny Eve' })
  await db.insert(mantels).values({
    id: LEO,
    kind: 'child',
    name: 'Leo',
    publicKey: 'leo-mantel-key',
    handoverOn: HANDOVER_DAY,
    recoveryProofHash: 'a'.repeat(64),
  })
  await db.insert(mantelKeepers).values([
    { mantelId: LEO, userId: 'ann', role: 'guardian' },
    { mantelId: LEO, userId: 'bob', role: 'guardian' },
  ])
  await db.insert(mantelKeyWraps).values([
    { mantelId: LEO, kind: 'keeper', keeperId: 'ann', wrapped: keeperWrap('ann') },
    { mantelId: LEO, kind: 'keeper', keeperId: 'bob', wrapped: keeperWrap('bob') },
    { mantelId: LEO, kind: 'recovery', wrapped: 'recovery-copy' },
  ])
  await db.insert(postalProfiles).values({ userId: LEO, ...CHICAGO })
  await db
    .insert(mantelOpenings)
    .values({ mantelId: LEO, onArrival: true, days: [{ on: BIRTHDAY, label: '18' }] })
  await openMantelCorrespondence(db, 'ann', LEO, MONDAY)
  eveToLeo = crypto.randomUUID()
  await db.insert(correspondences).values({ id: eveToLeo, mantelId: LEO })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: eveToLeo, userId: 'eve' },
    { correspondenceId: eveToLeo, userId: LEO },
  ])
})

describe('the handover day', () => {
  it('moves only when more than half of the keepers agree, and not once it has come', async () => {
    const proposed = await proposeHandoverDate(db, 'ann', { mantelId: LEO, on: BIRTHDAY }, MONDAY)
    expect(proposed).toMatchObject({ result: 'proposed', carried: false })
    expect((await getMantel(db, 'ann', LEO))?.handoverOn).toBe(HANDOVER_DAY)
    if (proposed.result !== 'proposed') throw new Error(proposed.result)
    await voteForProposal(db, 'bob', proposed.proposalId, MONDAY)
    expect((await getMantel(db, 'ann', LEO))?.handoverOn).toBe(BIRTHDAY)

    await db.update(mantels).set({ handoverOn: HANDOVER_DAY }).where(eq(mantels.id, LEO))
    expect(await proposeHandoverDate(db, 'ann', { mantelId: LEO, on: BIRTHDAY }, FRIDAY)).toEqual({
      result: 'passed',
    })
  })

  it('refuses a day that is past, or too far off, and anyone who does not keep it', async () => {
    const propose = (who: string, on: string) =>
      proposeHandoverDate(db, who, { mantelId: LEO, on }, MONDAY)
    expect(await propose('ann', '2026-11-16')).toEqual({ result: 'bad-day' })
    expect(await propose('ann', '2060-01-01')).toEqual({ result: 'bad-day' })
    expect(await propose('eve', BIRTHDAY)).toEqual({ result: 'not-keeper' })
  })

  it('is set for a mantel opened before there was one by the same vote', async () => {
    await db.update(mantels).set({ handoverOn: null }).where(eq(mantels.id, LEO))
    expect(await handoverForKeeper(db, 'ann', LEO, MONDAY)).toMatchObject({
      handoverOn: null,
      due: false,
    })
    const proposed = await proposeHandoverDate(db, 'bob', { mantelId: LEO, on: BIRTHDAY }, MONDAY)
    if (proposed.result !== 'proposed') throw new Error(proposed.result)
    await voteForProposal(db, 'ann', proposed.proposalId, MONDAY)
    expect((await getMantel(db, 'ann', LEO))?.handoverOn).toBe(BIRTHDAY)
  })
})

describe('inviting the child', () => {
  it('invites the address any keeper gave, from the day itself and not before', async () => {
    expect(await nameChild(db, 'ann', { mantelId: LEO, email: 'Leo@Example.com' }, MONDAY)).toEqual(
      { result: 'named', others: ['bob'], due: false },
    )
    expect(await dueHandovers(db, MONDAY)).toEqual([])
    expect(await handoversFor(db, 'leo')).toEqual([])

    const [due] = await dueHandovers(db, FRIDAY)
    expect(due).toMatchObject({ mantelId: LEO, invite: 'leo@example.com', tellKeepers: true })
    await markHandoverSent(db, LEO, { invited: 'leo@example.com', keepersTold: true }, FRIDAY)
    expect(await dueHandovers(db, FRIDAY)).toEqual([])
    expect(await handoversFor(db, 'leo')).toEqual([
      { mantelId: LEO, name: 'Leo', accepted: false, keyGiven: false },
    ])
    expect(await handoversFor(db, 'eve')).toEqual([])
  })

  it('never hands the mantel to one of its keepers', async () => {
    expect(await nameChild(db, 'ann', { mantelId: LEO, email: 'bob@example.com' }, MONDAY)).toEqual(
      { result: 'is-keeper' },
    )
    expect(await nameChild(db, 'eve', { mantelId: LEO, email: 'leo@example.com' }, MONDAY)).toEqual(
      { result: 'not-keeper' },
    )
  })

  it('lets only that address accept, and needs a keeper’s browser to give the key', async () => {
    await nameChild(db, 'ann', { mantelId: LEO, email: 'leo@example.com' }, MONDAY)
    await markHandoverSent(db, LEO, { invited: 'leo@example.com' }, FRIDAY)
    expect(await acceptHandover(db, 'eve', LEO, FRIDAY)).toBe('gone')
    expect(await acceptHandover(db, 'leo', LEO, FRIDAY)).toBe('accepted')
    expect(await handoverForKeeper(db, 'bob', LEO, FRIDAY)).toMatchObject({
      due: true,
      childId: 'leo',
      keyGiven: false,
    })
    expect(await handoverToTake(db, 'leo', LEO)).toBeNull()

    const give = (keyVersion: number) =>
      giveHandoverKey(
        db,
        'bob',
        { mantelId: LEO, childId: 'leo', wrapped: keeperWrap('leo'), keyVersion },
        FRIDAY,
      )
    // Wrapped from a key the mantel no longer has.
    expect(await give(2)).toBe('not-ready')
    expect(await give(1)).toBe('given')
    expect(await handoverToTake(db, 'leo', LEO)).toMatchObject({ wrapped: keeperWrap('leo') })
    // Once the child holds the key, the address no longer changes.
    expect(await nameChild(db, 'ann', { mantelId: LEO, email: 'cal@example.com' }, FRIDAY)).toEqual(
      { result: 'key-given' },
    )
    // A re-key since leaves the child's copy behind: a keeper gives it again.
    await db.update(mantels).set({ keyVersion: 2 }).where(eq(mantels.id, LEO))
    expect(await handoverToTake(db, 'leo', LEO)).toBeNull()
  })
})

describe('making the letters the child’s', () => {
  beforeEach(async () => {
    expect((await toLeo(1)).status).toBe('sealed')
    expect((await toLeo(2, BIRTHDAY)).status).toBe('sealed')
    await deliverAll()
    // On its way when the mantel is handed over.
    expect((await toLeo(3)).status).toBe('sealed')
    // A letter a keeper wrote as the child, back to Granny Eve.
    await db.insert(letters).values({
      id: letterId(4),
      correspondenceId: eveToLeo,
      authorId: LEO,
      ciphertext: CIPHERTEXT,
    })
    await db.insert(letterKeys).values({ letterId: letterId(4), userId: LEO, wrappedKey: 'own' })
    expect(await readyToTake()).toBe('given')
  })

  it('changes nothing until every letter key has the child’s copy', async () => {
    expect(await closeHandover(db, 'leo', LEO, FRIDAY)).toBe('letters-left')
    const plan = await handoverPlan(db, 'leo', LEO)
    expect(plan?.letterKeys.map((key) => key.letterId)).toEqual([1, 2, 3, 4].map(letterId))
    await stageHandoverKeys(
      db,
      'leo',
      { mantelId: LEO, letterKeys: [{ letterId: letterId(1), wrappedKey: forChild(letterId(1)) }] },
      FRIDAY,
    )
    expect((await handoverPlan(db, 'leo', LEO))?.letterKeys).toHaveLength(3)
    expect(await closeHandover(db, 'leo', LEO, FRIDAY)).toBe('letters-left')
    // The keepers still keep it and read it, and the child reads nothing yet.
    expect(await getMantel(db, 'ann', LEO)).not.toBeNull()
    expect(await listKeptMantel(db, 'ann', LEO, FRIDAY)).toHaveLength(2)
    expect(await listMantel(db, 'leo', FRIDAY)).toEqual([])
  })

  it('refuses while a letter that arrived meanwhile has no copy for the child', async () => {
    await stageAll()
    expect((await toLeo(5, null, FRIDAY)).status).toBe('sealed')
    expect(await closeHandover(db, 'leo', LEO, FRIDAY)).toBe('letters-left')
    await stageAll()
    expect(await closeHandover(db, 'leo', LEO, FRIDAY)).toBe('handed-over')
  })

  it('moves everything to the child at once, and leaves the keepers nothing', async () => {
    await stageAll()
    expect(await closeHandover(db, 'leo', LEO, FRIDAY)).toBe('handed-over')

    // Every copy of the mantel's key is gone, the recovery code's too.
    expect(await db.select().from(mantelKeyWraps).where(eq(mantelKeyWraps.mantelId, LEO))).toEqual(
      [],
    )
    expect(await getMantel(db, 'ann', LEO)).toBeNull()
    expect(await getMantel(db, 'bob', LEO)).toBeNull()
    expect(await listKeptMantel(db, 'ann', LEO, FRIDAY)).toBeNull()
    expect(await handoverForKeeper(db, 'ann', LEO, FRIDAY)).toBeNull()
    expect(await db.select().from(letterKeys).where(eq(letterKeys.userId, LEO))).toEqual([])
    expect(await db.select().from(deliveries).where(eq(deliveries.recipientId, LEO))).toEqual([])
    expect(await db.select().from(handoverKeys)).toEqual([])
    const [mantel] = await db.select().from(mantels).where(eq(mantels.id, LEO))
    expect(mantel).toMatchObject({ handedOverTo: 'leo', recoveryProofHash: null })
    expect(mantel?.closedAt).not.toBeNull()

    // The child holds every key, wrapped to their own.
    const held = await db.select().from(letterKeys).where(eq(letterKeys.userId, 'leo'))
    expect(held.map((row) => row.wrappedKey).toSorted()).toEqual(
      [1, 2, 3, 4].map((n) => forChild(letterId(n))).toSorted(),
    )
    // What a keeper wrote as the child is the child's.
    const [own] = await db
      .select()
      .from(letters)
      .where(eq(letters.id, letterId(4)))
    expect(own?.authorId).toBe('leo')
  })

  it('keeps a sealed letter sealed on the child’s own mantel', async () => {
    await stageAll()
    await closeHandover(db, 'leo', LEO, FRIDAY)
    const shelf = await listMantel(db, 'leo', FRIDAY)
    expect(shelf.find((item) => item.letterId === letterId(1))).toMatchObject({
      name: 'Granny Eve',
      sealedUntil: null,
    })
    expect(shelf.find((item) => item.letterId === letterId(2))).toMatchObject({
      sealedUntil: BIRTHDAY,
    })
    expect(await openLetter(db, 'leo', letterId(2), FRIDAY)).toBeNull()
    expect(await openLetter(db, 'leo', letterId(1), FRIDAY)).toMatchObject({
      wrappedKey: forChild(letterId(1)),
    })
    const opening = new Date(`${BIRTHDAY}T18:00:00Z`)
    expect(await openLetter(db, 'leo', letterId(2), opening)).toMatchObject({
      wrappedKey: forChild(letterId(2)),
    })
  })

  it('turns each writer’s letters to the mantel into letters to the child', async () => {
    await stageAll()
    await closeHandover(db, 'leo', LEO, FRIDAY)
    // The letter on its way arrives for the child, on the child's post.
    const [inTransit] = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.letterId, letterId(3)))
    expect(inTransit).toMatchObject({ recipientId: 'leo', state: 'in_transit' })
    // Granny Eve now writes to Leo.
    expect(await planSeal(db, 'eve', eveToLeo, FRIDAY)).toMatchObject({
      recipientId: 'leo',
      recipientPublicKey: 'public-key-of-leo',
      toMantel: false,
    })
    const [correspondence] = await db
      .select()
      .from(correspondences)
      .where(eq(correspondences.id, eveToLeo))
    expect(correspondence?.mantelId).toBeNull()
    // A letter her browser wrapped to the mantel before is refused, as the browser
    // sends it: one copy per reader it was planned for.
    await saveDraft(
      db,
      'eve',
      {
        id: letterId(6),
        correspondenceId: eveToLeo,
        ciphertext: CIPHERTEXT,
        wrappedKey: 'key-for-eve',
      },
      FRIDAY,
    )
    expect(
      (
        await sealLetter(db, 'eve', letterId(6), { [LEO]: 'mantel-copy' }, FRIDAY, null, false, {
          [LEO]: 'leo-mantel-key',
        })
      ).status,
    ).toBe('readers-changed')
  })

  it('says the same when run twice, and changes nothing more', async () => {
    await stageAll()
    expect(await closeHandover(db, 'leo', LEO, FRIDAY)).toBe('handed-over')
    const before = await db.select().from(letterKeys).where(eq(letterKeys.userId, 'leo'))
    expect(await closeHandover(db, 'leo', LEO, FRIDAY)).toBe('handed-over')
    expect(await closeHandover(db, 'eve', LEO, FRIDAY)).toBe('not-ready')
    expect(await db.select().from(letterKeys).where(eq(letterKeys.userId, 'leo'))).toEqual(before)
  })

  it('takes no copy of a letter the mantel does not hold', async () => {
    await stageHandoverKeys(
      db,
      'leo',
      { mantelId: LEO, letterKeys: [{ letterId: letterId(9), wrappedKey: 'stray' }] },
      FRIDAY,
    )
    expect(
      await db
        .select()
        .from(handoverKeys)
        .where(and(eq(handoverKeys.mantelId, LEO), eq(handoverKeys.letterId, letterId(9)))),
    ).toEqual([])
    expect(
      await stageHandoverKeys(
        db,
        'eve',
        { mantelId: LEO, letterKeys: [{ letterId: letterId(1), wrappedKey: 'x' }] },
        FRIDAY,
      ),
    ).toBe('not-ready')
  })
})

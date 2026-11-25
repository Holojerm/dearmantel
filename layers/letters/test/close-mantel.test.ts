// Closing a kept mantel, against a real D1: more than half of its keepers
// agree, as with any custody change. Then nobody writes to it, letters on
// their way to it go back to their senders, each writer and each other
// keeper is told, and everything already on it stays with its keepers.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '~~/server/db/schema'

import { proposeClose } from '#layers/keys/server/utils/close-mantel'
import {
  proposeKeeper,
  proposeRemoval,
  proposalsOf,
  voteForProposal,
} from '#layers/keys/server/utils/custody'
import { handoverForKeeper } from '#layers/keys/server/utils/handover'
import { dueHandovers } from '#layers/keys/server/utils/handover-due'
import { getMantel } from '#layers/keys/server/utils/mantels'
import { soleKeeperOf } from '#layers/keys/server/utils/sole-keeper'

import { openMantelCorrespondence } from '../server/utils/correspondences'
import { saveDraft } from '../server/utils/drafts'
import { listKeptMantel } from '../server/utils/kept-mantel'
import { registerLettersExtensions } from '../server/utils/letters-extensions'
import { planSeal, sealLetter } from '../server/utils/posting'

const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[])
vi.mock('#server/utils/email', () => ({
  sendEmail: async (email: { to: string; subject: string; text: string }) => {
    sent.push(email)
    return true
  },
}))

const db = drizzle(env.DB, { schema })
const {
  users,
  userKeys,
  postalProfiles,
  mantels,
  mantelKeepers,
  mantelKeyWraps,
  mantelProposals,
  mantelVotes,
  correspondences,
  correspondenceMembers,
  invites,
  letters,
  letterKeys,
  deliveries,
} = schema

const LEO = 'aaaaaaaa-0000-4000-8000-000000000021'
const MONDAY = new Date('2026-11-16T20:00:00Z')
const TUESDAY = new Date('2026-11-17T20:00:00Z')
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}
const letterId = (n: number) => `5c1f6c1e-0d3a-4c1f-9e57-${String(n).padStart(12, '0')}`

let eveToLeo = ''

async function seal(author: string, id: string, correspondenceId: string, now = MONDAY) {
  await saveDraft(
    db,
    author,
    { id, correspondenceId, ciphertext: CIPHERTEXT, wrappedKey: `key-for-${author}` },
    now,
  )
  return sealLetter(db, author, id, 'key-for-leo', now, null, false, { [LEO]: 'leo-key' })
}

/** Ann proposes closing Leo's mantel and Bob agrees. */
async function closedByBoth() {
  const proposal = await proposeClose(db, 'ann', LEO, TUESDAY)
  if (proposal.result !== 'proposed') throw new Error(proposal.result)
  expect(proposal.closed).toBe(false)
  expect(await voteForProposal(db, 'bob', proposal.proposalId, TUESDAY)).toBe('voted')
}

beforeAll(() => {
  registerLettersExtensions()
  vi.stubGlobal('useRuntimeConfig', () => ({
    public: { appName: 'Dear Mantel', appUrl: 'https://dearmantel.test' },
  }))
})

beforeEach(async () => {
  sent.length = 0
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    invites,
    correspondenceMembers,
    correspondences,
    mantelVotes,
    mantelProposals,
    mantelKeyWraps,
    mantelKeepers,
    mantels,
    postalProfiles,
    userKeys,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
  }
  await db.insert(mantels).values({ id: LEO, kind: 'child', name: 'Leo', publicKey: 'leo-key' })
  await db.insert(postalProfiles).values({ userId: LEO, ...CHICAGO })
  await db
    .insert(mantelKeepers)
    .values(['ann', 'bob'].map((userId) => ({ mantelId: LEO, userId, role: 'guardian' as const })))
  await db.insert(mantelKeyWraps).values([
    { mantelId: LEO, kind: 'keeper', keeperId: 'ann', wrapped: 'wrap-for-ann' },
    { mantelId: LEO, kind: 'keeper', keeperId: 'bob', wrapped: 'wrap-for-bob' },
    { mantelId: LEO, kind: 'recovery', keeperId: '', wrapped: 'wrap-for-code' },
  ])
  // Granny Eve, a writer the keepers invited.
  eveToLeo = crypto.randomUUID()
  await db.insert(correspondences).values({ id: eveToLeo, mantelId: LEO })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: eveToLeo, userId: 'eve' },
    { correspondenceId: eveToLeo, userId: LEO },
  ])
})

describe('who closes a kept mantel', () => {
  it('takes both of two keepers: one alone only proposes it', async () => {
    const proposal = await proposeClose(db, 'ann', LEO, TUESDAY)
    expect(proposal).toMatchObject({ result: 'proposed', closed: false })
    const [mantel] = await db.select().from(mantels).where(eq(mantels.id, LEO))
    expect(mantel?.closedAt).toBeNull()
    const waiting = await proposalsOf(db, 'bob', LEO, TUESDAY)
    expect(waiting).toMatchObject([{ kind: 'close', votes: 1, keepers: 2, carried: false }])

    await voteForProposal(db, 'bob', waiting[0]!.id, TUESDAY)
    const [closed] = await db.select().from(mantels).where(eq(mantels.id, LEO))
    expect(closed?.closedAt).toEqual(TUESDAY)
    expect(await proposalsOf(db, 'ann', LEO, TUESDAY)).toEqual([])
  })

  it("closes at once for a mantel's only keeper", async () => {
    await db.delete(mantelKeepers).where(eq(mantelKeepers.userId, 'bob'))
    expect(await proposeClose(db, 'ann', LEO, TUESDAY)).toMatchObject({ closed: true })
  })

  it('is refused to anyone who does not keep it, and asked only once', async () => {
    expect(await proposeClose(db, 'eve', LEO, TUESDAY)).toEqual({ result: 'not-keeper' })
    await proposeClose(db, 'ann', LEO, TUESDAY)
    expect(await proposeClose(db, 'bob', LEO, TUESDAY)).toEqual({ result: 'already-proposed' })
  })

  it('ends the proposals about who keeps it, and takes no new ones', async () => {
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: LEO, email: 'cal@example.com', role: 'guardian' },
      MONDAY,
    )
    await closedByBoth()
    const [row] = await db
      .select()
      .from(mantelProposals)
      .where(eq(mantelProposals.id, offer.result === 'proposed' ? offer.proposalId : ''))
    expect(row).toMatchObject({ outcome: 'withdrawn', subjectEmail: null })
    expect(
      await proposeKeeper(
        db,
        'ann',
        { mantelId: LEO, email: 'cal@example.com', role: 'guardian' },
        TUESDAY,
      ),
    ).toEqual({ result: 'closed' })
    expect(await proposeRemoval(db, 'ann', { mantelId: LEO, keeperId: 'bob' }, TUESDAY)).toEqual({
      result: 'closed',
    })
    expect(await proposeClose(db, 'ann', LEO, TUESDAY)).toEqual({ result: 'closed' })
  })
})

describe('a closed mantel', () => {
  it('takes no more letters, from its writers or its keepers', async () => {
    const annToLeo = (await openMantelCorrespondence(db, 'ann', LEO, MONDAY))!
    await closedByBoth()
    expect(await planSeal(db, 'eve', eveToLeo, TUESDAY)).toBe('closed')
    expect(await planSeal(db, 'ann', annToLeo, TUESDAY)).toBe('closed')
    expect(await openMantelCorrespondence(db, 'ann', LEO, TUESDAY)).toBeNull()
    const [eves] = await db.select().from(correspondences).where(eq(correspondences.id, eveToLeo))
    expect(eves).toMatchObject({ closedAt: TUESDAY, closedBy: LEO })
  })

  it('sends back what was on its way, and keeps what arrived', async () => {
    expect((await seal('eve', letterId(1), eveToLeo)).status).toBe('sealed')
    expect((await seal('eve', letterId(2), eveToLeo)).status).toBe('sealed')
    await db
      .update(deliveries)
      .set({ state: 'delivered', deliveredAt: MONDAY })
      .where(eq(deliveries.letterId, letterId(1)))
    await closedByBoth()

    const toLeo = await db.select().from(deliveries).where(eq(deliveries.recipientId, LEO))
    expect(toLeo.find((row) => row.letterId === letterId(1))?.state).toBe('delivered')
    expect(toLeo.find((row) => row.letterId === letterId(2))?.state).toBe('returned')
    const back = await db.select().from(deliveries).where(eq(deliveries.recipientId, 'eve'))
    expect(back.map((row) => row.letterId)).toContain(letterId(2))

    // Its keepers still read it: their copies of its key, and the code's, stay.
    const kept = await listKeptMantel(db, 'ann', LEO, TUESDAY)
    expect(kept?.map((row) => row.letterId)).toEqual([letterId(1)])
    expect(await db.select().from(mantelKeyWraps)).toHaveLength(3)
    expect((await getMantel(db, 'bob', LEO))?.closedAt).toEqual(TUESDAY)
  })

  it('tells each writer, and each keeper whose vote did not close it', async () => {
    await closedByBoth()
    const to = sent.map((email) => email.to).toSorted()
    expect(to).toEqual(['ann@example.com', 'eve@example.com'])
    expect(sent.every((email) => email.subject === "Leo's mantel is closed")).toBe(true)
    expect(sent.find((email) => email.to === 'eve@example.com')?.text).toMatch(
      /You can no longer write to it/,
    )
  })

  it('ends the invitations to write to it', async () => {
    await db.insert(invites).values({
      id: crypto.randomUUID(),
      inviterId: 'ann',
      inviteeEmail: 'cal@example.com',
      tokenHash: 'hash-of-a-token',
      expiresAt: new Date('2026-12-01T00:00:00Z'),
      mantelId: LEO,
    })
    await closedByBoth()
    const [invite] = await db.select().from(invites)
    expect(invite).toMatchObject({ expiresAt: TUESDAY, inviteeEmail: null })
  })

  it("is still handed over to the child on its day: closing removes none of a child's letters", async () => {
    await db.update(mantels).set({ handoverOn: '2026-11-17' }).where(eq(mantels.id, LEO))
    await closedByBoth()
    expect(await handoverForKeeper(db, 'ann', LEO, TUESDAY)).toMatchObject({ due: true })
    expect((await dueHandovers(db, TUESDAY)).map((due) => due.mantelId)).toEqual([LEO])
  })

  it('still asks its last keeper for the recovery code before they delete their account', async () => {
    await db.delete(mantelKeepers).where(eq(mantelKeepers.userId, 'bob'))
    await proposeClose(db, 'ann', LEO, TUESDAY)
    expect((await soleKeeperOf(db, 'ann')).map((mantel) => mantel.id)).toEqual([LEO])
  })
})

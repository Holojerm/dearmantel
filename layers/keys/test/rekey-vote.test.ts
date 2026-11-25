// Changing a mantel's key by the keepers' vote, against a real D1: it is
// asked for only once more than half of them agree (a sole keeper alone),
// the re-key that follows is guarded on the key's version, and a vote counted
// after the key has changed asks for nothing. A keeper leaving still asks
// with no vote.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { sha256Hex } from '#server/utils/hash'

import {
  acceptSeat,
  grantSeat,
  proposeKeeper,
  proposeRemoval,
  proposalsOf,
  voteForProposal,
  withdrawProposal,
} from '../server/utils/custody'
import { createMantel, getMantel } from '../server/utils/mantels'
import { rekeyPlan, rekeyStatements } from '../server/utils/rekey'
import { proposeRekey } from '../server/utils/rekey-vote'

const db = drizzle(env.DB, { schema })
const { users, userKeys, mantels, mantelKeepers, mantelKeyWraps, mantelProposals, mantelVotes } =
  schema

const NOW = new Date('2026-11-25T12:00:00Z')
const LATER = new Date('2026-11-26T12:00:00Z')
const MANTEL = '7c2a9e44-1b0d-4f3e-8a61-2d4e6f8a0b12'
const OLD_KEY = 'A'.repeat(122)
const NEW_KEY = 'B'.repeat(122)
const NEWER_KEY = 'C'.repeat(122)
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const recoveryWrap = (fill: string) => `v1.${'I'.repeat(16)}.${fill.repeat(160)}`

const mantel = async () => (await db.select().from(mantels).where(eq(mantels.id, MANTEL)))[0]!

async function seat(who: string, voters: string[] = []) {
  const offer = await proposeKeeper(
    db,
    'ann',
    { mantelId: MANTEL, email: `${who}@example.com`, role: 'guardian' },
    NOW,
  )
  if (offer.result !== 'proposed') throw new Error(offer.result)
  for (const voter of voters) await voteForProposal(db, voter, offer.proposalId, NOW)
  await acceptSeat(db, who, offer.proposalId, NOW)
  const { keyVersion } = await mantel()
  return grantSeat(db, 'ann', offer.proposalId, { wrapped: keeperWrap(who), keyVersion }, NOW)
}

/** What a keeper's browser sends after making a new key, from the plan it read. */
async function rekey(who: string, publicKey: string, at = LATER) {
  const plan = await rekeyPlan(db, who, MANTEL)
  if (!plan) return 'no-plan'
  const ready = await rekeyStatements(
    db,
    who,
    {
      mantelId: MANTEL,
      keyVersion: plan.keyVersion,
      publicKey,
      keeperWrap: keeperWrap(`${who}-new`),
      recoveryWrap: recoveryWrap('N'),
      recoveryProofHash: await sha256Hex(`proof-${publicKey[0]}`),
      handovers: Object.fromEntries(plan.others.map((o) => [o.userId, keeperWrap(o.userId)])),
    },
    at,
  )
  if (ready.status !== 'ready') return ready.status
  await db.batch(ready.statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return 'rekeyed'
}

async function propose(who = 'ann', at = NOW) {
  const outcome = await proposeRekey(db, who, MANTEL, at)
  if (outcome.result !== 'proposed') throw new Error(outcome.result)
  return outcome
}

beforeEach(async () => {
  for (const table of [
    mantelVotes,
    mantelProposals,
    mantelKeyWraps,
    mantelKeepers,
    mantels,
    userKeys,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'cal', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `key-of-${id}` })
  }
  await createMantel(
    db,
    'ann',
    {
      id: MANTEL,
      kind: 'child',
      name: 'Leo',
      publicKey: OLD_KEY,
      keeperWrap: keeperWrap('ann'),
      recoveryWrap: recoveryWrap('R'),
      recoveryProofHash: await sha256Hex('proof-A'),
    },
    NOW,
  )
})

describe('a sole keeper', () => {
  it('asks for the change alone, and can then make it', async () => {
    expect(await rekeyPlan(db, 'ann', MANTEL)).toBeNull()
    expect((await propose()).due).toBe(true)
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: true, rekeyAsked: true })
    expect(await proposalsOf(db, 'ann', MANTEL, NOW)).toEqual([])
    expect(await rekey('ann', NEW_KEY)).toBe('rekeyed')
    expect(await mantel()).toMatchObject({ publicKey: NEW_KEY, keyVersion: 2, rekeyDueAt: null })
  })

  it('cannot ask twice while it is due', async () => {
    await propose()
    expect(await proposeRekey(db, 'ann', MANTEL, NOW)).toEqual({ result: 'already-due' })
  })
})

describe('three keepers', () => {
  beforeEach(async () => {
    expect(await seat('bob')).toBe('seated')
    expect(await seat('cal', ['bob'])).toBe('seated')
  })

  it('need more than half: one proposing asks for nothing yet', async () => {
    const { proposalId, due } = await propose()
    expect(due).toBe(false)
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: false })
    expect(await rekeyPlan(db, 'ann', MANTEL)).toBeNull()
    expect(await rekey('ann', NEW_KEY)).toBe('no-plan')
    expect(await proposalsOf(db, 'cal', MANTEL, NOW)).toMatchObject([
      { id: proposalId, kind: 'rekey', votes: 1, keepers: 3, carried: false },
    ])

    expect(await voteForProposal(db, 'bob', proposalId, NOW)).toBe('voted')
    for (const keeper of ['ann', 'bob', 'cal']) {
      expect(await getMantel(db, keeper, MANTEL)).toMatchObject({
        rekeyDue: true,
        rekeyAsked: true,
      })
    }
    const [settled] = await db
      .select()
      .from(mantelProposals)
      .where(eq(mantelProposals.id, proposalId))
    expect(settled).toMatchObject({ outcome: 'done' })
  })

  it('the keeper whose vote carried it changes the key; the others are handed it', async () => {
    const { proposalId } = await propose()
    await voteForProposal(db, 'cal', proposalId, NOW)
    expect(await rekeyPlan(db, 'cal', MANTEL)).toMatchObject({
      keyVersion: 1,
      others: expect.arrayContaining([
        { userId: 'ann', publicKey: 'key-of-ann' },
        { userId: 'bob', publicKey: 'key-of-bob' },
      ]),
    })
    expect(await rekey('cal', NEW_KEY)).toBe('rekeyed')
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({
      publicKey: NEW_KEY,
      rekeyDue: false,
      rekeyAsked: false,
      handover: { previous: keeperWrap('ann'), wrapped: keeperWrap('ann') },
    })
  })

  it('refuses a second proposal while one waits, and anyone who does not keep it', async () => {
    await propose()
    expect(await proposeRekey(db, 'bob', MANTEL, NOW)).toEqual({ result: 'already-proposed' })
    expect(await proposeRekey(db, 'eve', MANTEL, NOW)).toEqual({ result: 'not-keeper' })
  })

  it('can be withdrawn by whoever proposed it, and then asks for nothing', async () => {
    const { proposalId } = await propose()
    expect(await withdrawProposal(db, 'ann', proposalId, NOW)).toBe(true)
    expect(await voteForProposal(db, 'bob', proposalId, NOW)).toBe('gone')
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: false })
  })

  it('a key changed while the vote waited settles it, and a late vote asks nothing', async () => {
    const { proposalId } = await propose()
    // Cal leaves, by a vote of his own: the re-key that asks for needs no vote.
    const removal = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'cal' }, NOW)
    if (removal.result !== 'proposed') throw new Error(removal.result)
    await voteForProposal(db, 'bob', removal.proposalId, NOW)
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: true, rekeyAsked: false })
    expect(await rekey('ann', NEW_KEY)).toBe('rekeyed')

    expect(await voteForProposal(db, 'bob', proposalId, LATER)).toBe('gone')
    expect(await mantel()).toMatchObject({ keyVersion: 2, rekeyDueAt: null })
  })

  it('a browser still working from the old key stores nothing', async () => {
    const { proposalId } = await propose()
    await voteForProposal(db, 'bob', proposalId, NOW)
    const stale = await rekeyPlan(db, 'bob', MANTEL)
    expect(await rekey('ann', NEW_KEY)).toBe('rekeyed')

    // Bob's browser read version 1 before Ann's change landed.
    const late = await rekeyStatements(
      db,
      'bob',
      {
        mantelId: MANTEL,
        keyVersion: stale!.keyVersion,
        publicKey: NEWER_KEY,
        keeperWrap: keeperWrap('bob-newer'),
        recoveryWrap: recoveryWrap('M'),
        recoveryProofHash: await sha256Hex('proof-C'),
        handovers: { ann: keeperWrap('ann'), cal: keeperWrap('cal') },
      },
      LATER,
    )
    expect(late.status).toBe('not-due')
    expect(await mantel()).toMatchObject({ publicKey: NEW_KEY, keyVersion: 2 })
  })

  it('says a keeper left, not that it was asked, when someone leaves after the vote', async () => {
    const { proposalId } = await propose()
    await voteForProposal(db, 'bob', proposalId, NOW)
    const removal = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'cal' }, LATER)
    if (removal.result !== 'proposed') throw new Error(removal.result)
    await voteForProposal(db, 'bob', removal.proposalId, LATER)
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ rekeyDue: true, rekeyAsked: false })
  })
})

describe('two keepers', () => {
  beforeEach(async () => {
    expect(await seat('bob')).toBe('seated')
  })

  it('need both', async () => {
    const { proposalId, due } = await propose('bob')
    expect(due).toBe(false)
    await voteForProposal(db, 'ann', proposalId, NOW)
    expect(await getMantel(db, 'bob', MANTEL)).toMatchObject({ rekeyDue: true })
  })
})

describe('a mantel that is closed or handed over', () => {
  it('still changes its key once closed: its keepers still keep its letters', async () => {
    await db.update(mantels).set({ closedAt: NOW }).where(eq(mantels.id, MANTEL))
    expect((await propose()).due).toBe(true)
  })

  it('has no key to change once handed over', async () => {
    // Handing over also ends every keeper; this checks the mantel's own mark.
    await db.update(mantels).set({ handedOverAt: NOW }).where(eq(mantels.id, MANTEL))
    expect(await proposeRekey(db, 'ann', MANTEL, NOW)).toEqual({ result: 'handed-over' })
  })
})

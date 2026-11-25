// Custodial mantels against a real D1: only keepers see a mantel, a custody
// change needs more than half of them, and the server cannot seat a keeper
// without a copy of the key a keeper's browser made.

import { env } from 'cloudflare:test'
import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import {
  clearExtensionsForTest,
  getAccountContributors,
  getDeletionGuards,
} from '#server/utils/extensions'

import {
  acceptSeat,
  grantSeat,
  proposeKeeper,
  proposeRemoval,
  seatToFill,
  voteForProposal,
  withdrawProposal,
} from '../server/utils/custody'
import { expireMantelProposals, registerKeysExtensions } from '../server/utils/keys-extensions'
import { createMantel, getMantel, keepersOf, listMantels } from '../server/utils/mantels'
import { carries, newMantelSchema } from '../shared/utils/mantel-format'

const db = drizzle(env.DB, { schema })
const { users, userKeys, mantels, mantelKeepers, mantelKeyWraps, mantelProposals, mantelVotes } =
  schema

const NOW = new Date('2026-11-16T12:00:00Z')
const LATER = new Date('2027-01-16T12:00:00Z')
const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const PUBLIC_KEY = 'A'.repeat(122)
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const RECOVERY_WRAP = `v1.${'I'.repeat(16)}.${'R'.repeat(160)}`

const leo = (id = MANTEL) => ({
  id,
  kind: 'child' as const,
  name: 'Leo',
  publicKey: PUBLIC_KEY,
  keeperWrap: keeperWrap('ann'),
  recoveryWrap: RECOVERY_WRAP,
  recoveryProofHash: 'a'.repeat(64),
  handoverOn: '2044-06-14',
})

const wrapsOf = async () =>
  (await db.select().from(mantelKeyWraps)).map((row) => `${row.kind}:${row.keeperId}`).toSorted()
const keeperIds = async () => (await keepersOf(db, MANTEL)).map((row) => row.userId).toSorted()

/** Bob is offered a seat, accepts, and a keeper's browser wraps the key to him. */
async function seat(who: string, proposer = 'ann', voters: string[] = []) {
  const offer = await proposeKeeper(
    db,
    proposer,
    { mantelId: MANTEL, email: `${who}@example.com`, role: 'guardian' },
    NOW,
  )
  if (offer.result !== 'proposed') throw new Error(offer.result)
  for (const voter of voters) await voteForProposal(db, voter, offer.proposalId, NOW)
  await acceptSeat(db, who, offer.proposalId, NOW)
  return {
    id: offer.proposalId,
    granted: await grantSeat(
      db,
      proposer,
      offer.proposalId,
      { wrapped: keeperWrap(who), keyVersion: 1 },
      NOW,
    ),
  }
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
    if (id !== 'eve') await db.insert(userKeys).values({ userId: id, publicKey: `key-of-${id}` })
  }
})

describe('the majority rule', () => {
  it('needs more than half', () => {
    expect(carries(1, 1)).toBe(true)
    expect(carries(1, 2)).toBe(false)
    expect(carries(2, 2)).toBe(true)
    expect(carries(2, 3)).toBe(true)
    expect(carries(2, 4)).toBe(false)
    expect(carries(0, 0)).toBe(false)
  })
})

describe('opening a mantel', () => {
  it('stores the public key, the founder as keeper, and two wrapped copies', async () => {
    expect(newMantelSchema.safeParse(leo()).success).toBe(true)
    expect(await createMantel(db, 'ann', leo(), NOW)).toBe('created')

    expect(await keepersOf(db, MANTEL)).toMatchObject([{ userId: 'ann', role: 'guardian' }])
    expect(await wrapsOf()).toEqual(['keeper:ann', 'recovery:'])
    expect(await listMantels(db, 'ann')).toMatchObject([{ id: MANTEL, name: 'Leo', kind: 'child' }])
  })

  it('never replaces a mantel, and needs an account with keys', async () => {
    await createMantel(db, 'ann', leo(), NOW)
    expect(await createMantel(db, 'bob', { ...leo(), name: 'Mine' }, NOW)).toBe('exists')
    expect((await db.select().from(mantels))[0]).toMatchObject({ name: 'Leo', createdBy: 'ann' })
    expect(await createMantel(db, 'eve', leo('9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d'), NOW)).toBe(
      'no-keys',
    )
  })

  it('shows a mantel to its keepers only, each with their own copy of the key', async () => {
    await createMantel(db, 'ann', leo(), NOW)

    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({
      publicKey: PUBLIC_KEY,
      wrappedKey: keeperWrap('ann'),
    })
    expect(await getMantel(db, 'bob', MANTEL)).toBeNull()
    expect(await listMantels(db, 'bob')).toEqual([])
  })
})

describe('adding a keeper', () => {
  beforeEach(() => createMantel(db, 'ann', leo(), NOW))

  it('takes the offer, the acceptance and a wrapped copy from a keeper', async () => {
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: ' Bob@Example.com ', role: 'guardian' },
      NOW,
    )
    if (offer.result !== 'proposed') throw new Error(offer.result)

    // Not accepted yet: there is nobody to wrap the key to.
    expect(await seatToFill(db, 'ann', offer.proposalId, NOW)).toBeNull()
    expect(
      await grantSeat(
        db,
        'ann',
        offer.proposalId,
        { wrapped: keeperWrap('bob'), keyVersion: 1 },
        NOW,
      ),
    ).toBe('not-ready')

    expect(await acceptSeat(db, 'cal', offer.proposalId, NOW)).toBe('not-yours')
    expect(await acceptSeat(db, 'bob', offer.proposalId, NOW)).toBe('accepted')
    expect(await seatToFill(db, 'bob', offer.proposalId, NOW)).toBeNull()
    expect(await seatToFill(db, 'ann', offer.proposalId, NOW)).toMatchObject({
      subjectId: 'bob',
      publicKey: 'key-of-bob',
    })
    expect(await keeperIds()).toEqual(['ann'])

    expect(
      await grantSeat(
        db,
        'bob',
        offer.proposalId,
        { wrapped: keeperWrap('bob'), keyVersion: 1 },
        NOW,
      ),
    ).toBe('not-ready')
    expect(
      await grantSeat(
        db,
        'ann',
        offer.proposalId,
        { wrapped: keeperWrap('bob'), keyVersion: 1 },
        NOW,
      ),
    ).toBe('seated')
    expect(await keeperIds()).toEqual(['ann', 'bob'])
    expect(await wrapsOf()).toEqual(['keeper:ann', 'keeper:bob', 'recovery:'])
    expect(await getMantel(db, 'bob', MANTEL)).toMatchObject({ wrappedKey: keeperWrap('bob') })
    const [settled] = await db.select().from(mantelProposals)
    expect(settled).toMatchObject({ outcome: 'done', subjectEmail: null })
  })

  it('needs both of two keepers before a third can be seated', async () => {
    await seat('bob')
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: 'cal@example.com', role: 'successor' },
      NOW,
    )
    if (offer.result !== 'proposed') throw new Error(offer.result)
    await acceptSeat(db, 'cal', offer.proposalId, NOW)

    expect(
      await grantSeat(
        db,
        'ann',
        offer.proposalId,
        { wrapped: keeperWrap('cal'), keyVersion: 1 },
        NOW,
      ),
    ).toBe('not-ready')
    expect(await voteForProposal(db, 'cal', offer.proposalId, NOW)).toBe('not-keeper')
    expect(await voteForProposal(db, 'bob', offer.proposalId, NOW)).toBe('voted')
    expect(await voteForProposal(db, 'bob', offer.proposalId, NOW)).toBe('voted')
    expect(
      await grantSeat(
        db,
        'bob',
        offer.proposalId,
        { wrapped: keeperWrap('cal'), keyVersion: 1 },
        NOW,
      ),
    ).toBe('seated')
    expect(await keeperIds()).toEqual(['ann', 'bob', 'cal'])
  })

  it('refuses a stranger, a keeper who is already one, and an account without keys', async () => {
    const offer = { mantelId: MANTEL, email: 'ann@example.com', role: 'guardian' as const }
    expect(await proposeKeeper(db, 'bob', offer, NOW)).toEqual({ result: 'not-keeper' })
    expect(await proposeKeeper(db, 'ann', offer, NOW)).toEqual({ result: 'already-keeper' })

    const toEve = await proposeKeeper(db, 'ann', { ...offer, email: 'eve@example.com' }, NOW)
    if (toEve.result !== 'proposed') throw new Error(toEve.result)
    expect(await acceptSeat(db, 'eve', toEve.proposalId, NOW)).toBe('no-keys')
  })

  it('says the same whether or not the address has an account', async () => {
    const known = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: 'bob@example.com', role: 'guardian' },
      NOW,
    )
    const unknown = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: 'nobody@example.com', role: 'guardian' },
      NOW,
    )
    expect(known.result).toBe('proposed')
    expect(unknown.result).toBe('proposed')
  })

  it('lapses after thirty days, and the address is forgotten', async () => {
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: 'bob@example.com', role: 'guardian' },
      NOW,
    )
    if (offer.result !== 'proposed') throw new Error(offer.result)

    expect(await acceptSeat(db, 'bob', offer.proposalId, LATER)).toBe('gone')
    expect(await expireMantelProposals(db, LATER)).toMatchObject({ count: 1 })
    expect((await db.select().from(mantelProposals))[0]).toMatchObject({
      outcome: 'expired',
      subjectEmail: null,
    })
  })

  it('can be taken back by whoever proposed it, and by nobody else', async () => {
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: 'bob@example.com', role: 'guardian' },
      NOW,
    )
    if (offer.result !== 'proposed') throw new Error(offer.result)

    expect(await withdrawProposal(db, 'cal', offer.proposalId, NOW)).toBe(false)
    expect(await withdrawProposal(db, 'ann', offer.proposalId, NOW)).toBe(true)
    expect(await acceptSeat(db, 'bob', offer.proposalId, NOW)).toBe('gone')
  })
})

describe('removing a keeper', () => {
  beforeEach(async () => {
    await createMantel(db, 'ann', leo(), NOW)
    await seat('bob')
  })

  it('cannot be done by one of two keepers alone', async () => {
    const removal = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'bob' }, NOW)
    expect(removal.result).toBe('proposed')
    expect(await keeperIds()).toEqual(['ann', 'bob'])
    expect(await wrapsOf()).toContain('keeper:bob')
  })

  it('takes effect when the other agrees, and their copy of the key goes', async () => {
    const removal = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'bob' }, NOW)
    if (removal.result !== 'proposed') throw new Error(removal.result)
    await voteForProposal(db, 'bob', removal.proposalId, NOW)

    expect(await keeperIds()).toEqual(['ann'])
    expect(await wrapsOf()).toEqual(['keeper:ann', 'recovery:'])
    expect(await getMantel(db, 'bob', MANTEL)).toBeNull()
  })

  it('is carried by two of three without the third', async () => {
    await seat('cal', 'ann', ['bob'])
    const removal = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'cal' }, NOW)
    if (removal.result !== 'proposed') throw new Error(removal.result)
    expect(await keeperIds()).toEqual(['ann', 'bob', 'cal'])
    await voteForProposal(db, 'bob', removal.proposalId, NOW)
    expect(await keeperIds()).toEqual(['ann', 'bob'])
  })

  it('never removes the last keeper', async () => {
    const first = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'bob' }, NOW)
    if (first.result !== 'proposed') throw new Error(first.result)
    await voteForProposal(db, 'bob', first.proposalId, NOW)
    await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'ann' }, NOW)
    expect(await keeperIds()).toEqual(['ann'])
  })
})

describe('a keeper deleting their account', () => {
  beforeEach(async () => {
    clearExtensionsForTest()
    registerKeysExtensions()
    await createMantel(db, 'ann', leo(), NOW)
  })

  const guard = () => getDeletionGuards().find((g) => g.key === 'mantel-keeper')!

  it('is refused while they are the only keeper', async () => {
    expect(await guard().check(db, 'ann')).toMatchObject({
      code: 'sole_mantel_keeper',
      data: { mantels: ['Leo'] },
    })
    expect(await guard().check(db, 'bob')).toBeNull()
  })

  it('is allowed once there is another, and only their copy of the key goes', async () => {
    await seat('bob')
    expect(await guard().check(db, 'ann')).toBeNull()

    const contributor = getAccountContributors().find((c) => c.key === 'keys')!
    const statements = contributor.deletionStatements!(db, 'ann') as BatchItem<'sqlite'>[]
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

    expect(await keeperIds()).toEqual(['bob'])
    expect(await wrapsOf()).toEqual(['keeper:bob', 'recovery:'])
    expect(
      await db
        .select()
        .from(mantels)
        .where(and(eq(mantels.id, MANTEL))),
    ).toHaveLength(1)
  })
})

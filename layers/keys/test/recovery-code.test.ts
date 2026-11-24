// A new recovery code with the same key, against a real D1: the old code
// stops finding and proving anything, the key and every keeper's copy stay,
// claims made with the old code are void, the other keepers are told once,
// and it is refused where a re-key is what is needed.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { sha256Hex } from '#server/utils/hash'

import {
  acceptSeat,
  grantSeat,
  proposeKeeper,
  proposeRemoval,
  voteForProposal,
} from '../server/utils/custody'
import { createMantel, getMantel } from '../server/utils/mantels'
import { claimRecovery, findByRecoveryProof } from '../server/utils/recovery'
import {
  newRecoveryCodeSchema,
  replaceMantelRecoveryCode,
  takeRecoveryCodeNotice,
} from '../server/utils/recovery-code'

const db = drizzle(env.DB, { schema })
const {
  users,
  userKeys,
  mantels,
  mantelKeepers,
  mantelKeyWraps,
  mantelProposals,
  mantelVotes,
  mantelRecoveries,
} = schema

const NOW = new Date('2026-11-16T12:00:00Z')
const LATER = new Date('2026-11-17T12:00:00Z')
const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const KEY = 'A'.repeat(122)
const OLD_PROOF = 'p'.repeat(43)
const NEW_PROOF = 'q'.repeat(43)
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const recoveryWrap = (fill: string) => `v1.${'I'.repeat(16)}.${fill.repeat(160)}`

const wrapsOf = async () =>
  (await db.select().from(mantelKeyWraps))
    .map((row) => `${row.kind}:${row.keeperId}:${row.wrapped.slice(-1)}`)
    .toSorted()

const input = async (over: Partial<schema.Mantel & Record<string, unknown>> = {}) => ({
  mantelId: MANTEL,
  keyVersion: 1,
  publicKey: KEY,
  recoveryWrap: recoveryWrap('N'),
  recoveryProofHash: await sha256Hex(NEW_PROOF),
  ...over,
})

const replace = async (who = 'ann', over = {}) =>
  replaceMantelRecoveryCode(db, who, newRecoveryCodeSchema.parse(await input(over)), LATER)

beforeEach(async () => {
  for (const table of [
    mantelRecoveries,
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
      publicKey: KEY,
      keeperWrap: keeperWrap('ann'),
      recoveryWrap: recoveryWrap('R'),
      recoveryProofHash: await sha256Hex(OLD_PROOF),
    },
    NOW,
  )
  const offer = await proposeKeeper(
    db,
    'ann',
    { mantelId: MANTEL, email: 'bob@example.com', role: 'guardian' },
    NOW,
  )
  if (offer.result !== 'proposed') throw new Error(offer.result)
  await acceptSeat(db, 'bob', offer.proposalId, NOW)
  await grantSeat(db, 'ann', offer.proposalId, { wrapped: keeperWrap('bob'), keyVersion: 1 }, NOW)
})

describe('a new recovery code', () => {
  it('replaces the copy under the old code and leaves the key and every keeper alone', async () => {
    expect(await replace()).toBe('replaced')

    expect(await findByRecoveryProof(db, OLD_PROOF)).toBeNull()
    expect(await findByRecoveryProof(db, NEW_PROOF)).toMatchObject({
      mantelId: MANTEL,
      recoveryWrap: recoveryWrap('N'),
    })
    // One copy under a code, never two.
    expect(await wrapsOf()).toEqual(['keeper:ann:W', 'keeper:bob:W', 'recovery::N'])
    const [mantel] = await db.select().from(mantels).where(eq(mantels.id, MANTEL))
    expect(mantel).toMatchObject({ publicKey: KEY, keyVersion: 1, rekeyDueAt: null })
  })

  it('voids a claim made with the old code, which cannot be made again', async () => {
    await claimRecovery(db, 'eve', { proof: OLD_PROOF, wrapped: keeperWrap('eve') }, NOW)
    expect(await replace()).toBe('replaced')

    const [claim] = await db.select().from(mantelRecoveries)
    expect(claim).toMatchObject({ cancelledBy: 'ann' })
    expect(claim!.cancelledAt).not.toBeNull()
    const again = await claimRecovery(
      db,
      'eve',
      { proof: OLD_PROOF, wrapped: keeperWrap('eve') },
      LATER,
    )
    expect(again.status).toBe('unknown')
  })

  it('tells the other keepers once, and not the one who made it', async () => {
    expect(await replace()).toBe('replaced')

    expect(await takeRecoveryCodeNotice(db, 'ann', MANTEL)).toBeNull()
    expect(await takeRecoveryCodeNotice(db, 'bob', MANTEL)).toEqual(LATER)
    expect(await takeRecoveryCodeNotice(db, 'bob', MANTEL)).toBeNull()
  })

  it('shows keepers the hash their browser compares a kept code with', async () => {
    expect(await replace()).toBe('replaced')
    expect(await getMantel(db, 'bob', MANTEL)).toMatchObject({
      recoveryProofHash: await sha256Hex(NEW_PROOF),
    })
  })
})

describe('what it refuses', () => {
  it('is for current keepers only', async () => {
    expect(await replace('eve')).toBe('not-keeper')
    expect(await findByRecoveryProof(db, OLD_PROOF)).not.toBeNull()
  })

  it('sends a keeper to the re-key when someone has left', async () => {
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: MANTEL, email: 'cal@example.com', role: 'guardian' },
      NOW,
    )
    if (offer.result !== 'proposed') throw new Error(offer.result)
    await voteForProposal(db, 'bob', offer.proposalId, NOW)
    await acceptSeat(db, 'cal', offer.proposalId, NOW)
    await grantSeat(db, 'ann', offer.proposalId, { wrapped: keeperWrap('cal'), keyVersion: 1 }, NOW)
    const removal = await proposeRemoval(db, 'ann', { mantelId: MANTEL, keeperId: 'cal' }, NOW)
    if (removal.result !== 'proposed') throw new Error(removal.result)
    await voteForProposal(db, 'bob', removal.proposalId, NOW)

    expect(await replace()).toBe('rekey-due')
    expect(await findByRecoveryProof(db, OLD_PROOF)).not.toBeNull()
  })

  it('stores nothing for a key the mantel no longer has, or the same code again', async () => {
    expect(await replace('ann', { keyVersion: 2 })).toBe('changed')
    expect(await replace('ann', { publicKey: 'B'.repeat(122) })).toBe('changed')
    expect(await replace('ann', { recoveryProofHash: await sha256Hex(OLD_PROOF) })).toBe('changed')
    expect(await findByRecoveryProof(db, OLD_PROOF)).not.toBeNull()
    expect(await takeRecoveryCodeNotice(db, 'bob', MANTEL)).toBeNull()
  })

  it('is refused for a keeper whose copy is not the current one', async () => {
    await db.delete(mantelKeyWraps).where(eq(mantelKeyWraps.keeperId, 'bob'))
    expect(await replace('bob')).toBe('changed')
  })

  it('takes only what a browser sends', async () => {
    expect(newRecoveryCodeSchema.safeParse(await input()).success).toBe(true)
    expect(newRecoveryCodeSchema.safeParse(await input({ recoveryWrap: 'short' })).success).toBe(
      false,
    )
    expect(
      newRecoveryCodeSchema.safeParse(await input({ recoveryProofHash: 'x'.repeat(64) })).success,
    ).toBe(false)
  })
})

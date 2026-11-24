// A mantel's only keeper deleting their account, against a real D1, through
// deleteAccount as the route calls it: refused without the recovery code's
// proof, refused with a wrong one, and done with the right one, leaving the
// mantel and its recovery copy for whoever holds the code.

import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { deleteAccount } from '#server/utils/account'
import { clearExtensionsForTest } from '#server/utils/extensions'
import { sha256Hex } from '#server/utils/hash'
import { noticeAudience } from '#layers/post/server/utils/notice-audience'

import { acceptSeat, grantSeat, proposeKeeper } from '../server/utils/custody'
import { registerKeysExtensions } from '../server/utils/keys-extensions'
import { createMantel, keepersOf } from '../server/utils/mantels'
import { claimRecovery, findByRecoveryProof } from '../server/utils/recovery'

const db = drizzle(env.DB, { schema })
const { users, userKeys, mantels, mantelKeepers, mantelKeyWraps, mantelProposals, mantelRecoveries } =
  schema

const NOW = new Date('2026-11-16T12:00:00Z')
const LEO = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const MAYA = '7d2e9a40-5b1c-4e8f-a3d6-2c9b8e7f6a12'
const PROOF = 'p'.repeat(43)
const MAYA_PROOF = 'm'.repeat(43)
const WRONG = 'x'.repeat(43)
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const RECOVERY_WRAP = `v1.${'I'.repeat(16)}.${'R'.repeat(160)}`

const mantel = async (id: string, name: string, proof: string) =>
  createMantel(
    db,
    'ann',
    {
      id,
      kind: 'child',
      name,
      publicKey: 'A'.repeat(122),
      keeperWrap: keeperWrap('ann'),
      recoveryWrap: RECOVERY_WRAP,
      recoveryProofHash: await sha256Hex(proof),
    },
    NOW,
  )

const remove = (proofs?: Record<string, string>) =>
  deleteAccount(db, 'ann', { mantelRecoveryProofs: proofs })

beforeEach(async () => {
  clearExtensionsForTest()
  registerKeysExtensions()
  for (const table of [mantelRecoveries, mantelProposals, mantelKeyWraps, mantelKeepers, mantels]) {
    await db.delete(table)
  }
  await db.delete(userKeys)
  await db.delete(users)
  for (const id of ['ann', 'bob']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `key-of-${id}` })
  }
  await mantel(LEO, 'Leo', PROOF)
})

describe("the only keeper's account", () => {
  it('is not deleted without the recovery code', async () => {
    expect(await remove()).toMatchObject({
      outcome: 'blocked',
      code: 'sole_mantel_keeper',
      data: { mantels: ['Leo'], kept: [{ id: LEO, name: 'Leo', kind: 'child' }] },
    })
    expect(await remove({})).toMatchObject({ code: 'sole_mantel_keeper' })
    const [ann] = await db.select().from(users).where(eq(users.id, 'ann'))
    expect(ann?.email).toBe('ann@example.com')
    expect((await keepersOf(db, LEO)).map((k) => k.userId)).toEqual(['ann'])
  })

  it('is not deleted with a wrong code, or a right code for another mantel', async () => {
    expect(await remove({ [LEO]: WRONG })).toMatchObject({
      outcome: 'blocked',
      code: 'mantel_recovery_code_mismatch',
      data: { mantels: ['Leo'] },
    })
    await mantel(MAYA, 'Maya', MAYA_PROOF)
    expect(await remove({ [LEO]: MAYA_PROOF, [MAYA]: MAYA_PROOF })).toMatchObject({
      code: 'mantel_recovery_code_mismatch',
      data: { mantels: ['Leo'] },
    })
    expect(await remove({ [LEO]: PROOF })).toMatchObject({
      code: 'mantel_recovery_code_mismatch',
      data: { mantels: ['Maya'] },
    })
    expect((await keepersOf(db, LEO)).map((k) => k.userId)).toEqual(['ann'])
  })

  it('is deleted with the code, and the mantel waits for whoever holds it', async () => {
    expect(await remove({ [LEO]: PROOF })).toMatchObject({ outcome: 'deleted' })

    expect(await keepersOf(db, LEO)).toEqual([])
    const [leo] = await db.select().from(mantels).where(eq(mantels.id, LEO))
    expect(leo).toMatchObject({ closedAt: null })
    expect(leo!.rekeyDueAt).not.toBeNull()
    // Only the copy under the code is left, and the code still finds it.
    const wraps = await db.select().from(mantelKeyWraps)
    expect(wraps.map((w) => w.kind)).toEqual(['recovery'])
    expect(await findByRecoveryProof(db, PROOF)).toMatchObject({ mantelId: LEO })
    const claim = await claimRecovery(db, 'bob', { proof: PROOF, wrapped: keeperWrap('bob') }, NOW)
    expect(claim).toMatchObject({ status: 'waiting', keeperIds: [] })
  })

  it('tells nobody, not the mantel in its own name, when mail arrives there', async () => {
    await remove({ [LEO]: PROOF })
    expect((await noticeAudience(db, [LEO, 'bob'])).get(LEO)).toEqual([])
    expect((await noticeAudience(db, [LEO, 'bob'])).has('bob')).toBe(false)
  })
})

describe('a keeper who is not the only one', () => {
  it('needs no code, as before', async () => {
    const offer = await proposeKeeper(
      db,
      'ann',
      { mantelId: LEO, email: 'bob@example.com', role: 'guardian' },
      NOW,
    )
    if (offer.result !== 'proposed') throw new Error(offer.result)
    await acceptSeat(db, 'bob', offer.proposalId, NOW)
    await grantSeat(db, 'ann', offer.proposalId, { wrapped: keeperWrap('bob'), keyVersion: 1 }, NOW)

    expect(await remove()).toMatchObject({ outcome: 'deleted' })
    expect((await keepersOf(db, LEO)).map((k) => k.userId)).toEqual(['bob'])
  })
})

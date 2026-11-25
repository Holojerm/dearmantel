// A mantel's recovery code against a real D1: it finds its mantel by a proof,
// gives a keeper their own access back at once, and makes anyone else wait
// while the keepers can cancel.

import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'
import { sha256Hex } from '#server/utils/hash'

import {
  generateMantelKeys,
  keyFingerprintToken,
  recoveryProof,
  recoveryProofHash,
  unwrapMantelKeyWithCode,
  wrapMantelKeyUnderCode,
} from '../app/utils/mantel-crypto'
import { createMantel, getMantel, keepersOf } from '../server/utils/mantels'
import {
  cancelRecovery,
  claimRecovery,
  findByRecoveryProof,
  finishRecovery,
  myRecoveries,
  recoveriesOf,
} from '../server/utils/recovery'
import { RECOVERY_WAIT_DAYS } from '../shared/utils/mantel-format'

const db = drizzle(env.DB, { schema })
const { users, userKeys, mantels, mantelKeepers, mantelKeyWraps, mantelRecoveries } = schema

const NOW = new Date('2026-11-16T12:00:00Z')
const AFTER = new Date(NOW.getTime() + (RECOVERY_WAIT_DAYS + 1) * 86_400_000)
const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const keeperWrap = (who: string) => `v1.${'P'.repeat(87)}.${'I'.repeat(16)}.${who.padEnd(160, 'W')}`
const RECOVERY_WRAP = `v1.${'I'.repeat(16)}.${'R'.repeat(160)}`
// What the browser derives from the recovery code; the server keeps its hash.
const PROOF = 'p'.repeat(43)
const code = (fill: number) => new Uint8Array(20).fill(fill)

const claim = (who: string, proof = PROOF) =>
  claimRecovery(db, who, { proof, wrapped: keeperWrap(`${who}-new`) }, NOW)
const keeperIds = async () => (await keepersOf(db, MANTEL)).map((row) => row.userId).toSorted()

beforeEach(async () => {
  for (const table of [mantelRecoveries, mantelKeyWraps, mantelKeepers, mantels, userKeys]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'cal', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    if (id !== 'eve') await db.insert(userKeys).values({ userId: id, publicKey: `key-of-${id}` })
  }
  await createMantel(
    db,
    'ann',
    {
      id: MANTEL,
      kind: 'child',
      name: 'Leo',
      publicKey: 'A'.repeat(122),
      keeperWrap: keeperWrap('ann'),
      recoveryWrap: RECOVERY_WRAP,
      recoveryProofHash: await sha256Hex(PROOF),
    },
    NOW,
  )
})

describe('what the code shows the server', () => {
  it('is the same for the same code, different for another, and hashes as the server does', async () => {
    const proof = await recoveryProof(code(7))

    expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await recoveryProof(code(7))).toBe(proof)
    expect(await recoveryProof(code(8))).not.toBe(proof)
    expect(await recoveryProofHash(proof)).toBe(await sha256Hex(proof))
  })

  it('does not open the copy of the key locked under the code', async () => {
    const mantel = await generateMantelKeys()
    const wrapped = await wrapMantelKeyUnderCode(code(7), MANTEL, mantel.privateKey)
    const proof = await recoveryProof(code(7))
    const asBytes = new Uint8Array(20)
    asBytes.set(new TextEncoder().encode(proof).slice(0, 20))

    expect(await unwrapMantelKeyWithCode(asBytes, MANTEL, wrapped)).toBeNull()
  })

  it('a link fingerprint is 22 url-safe characters', async () => {
    const mantel = await generateMantelKeys()
    expect(await keyFingerprintToken(mantel.publicKey)).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})

describe('using the code', () => {
  it('finds its mantel by the proof, and nothing by anything else', async () => {
    expect(await findByRecoveryProof(db, PROOF)).toEqual({
      mantelId: MANTEL,
      name: 'Leo',
      publicKey: expect.any(String),
      recoveryWrap: RECOVERY_WRAP,
    })
    expect(await findByRecoveryProof(db, 'x'.repeat(43))).toBeNull()
    expect((await claim('bob', 'x'.repeat(43))).status).toBe('unknown')
    expect((await claim('eve')).status).toBe('no-keys')
  })

  it('gives a keeper their own access back at once, and changes nothing else', async () => {
    expect(await claim('ann')).toEqual({ status: 'restored', mantelId: MANTEL })
    expect(await getMantel(db, 'ann', MANTEL)).toMatchObject({ wrappedKey: keeperWrap('ann-new') })
    expect(await keeperIds()).toEqual(['ann'])
    expect(await db.select().from(mantelRecoveries)).toEqual([])
  })

  it('makes anyone else wait, with the keepers to be told once', async () => {
    const first = await claim('bob')
    expect(first).toMatchObject({ status: 'waiting', name: 'Leo', keeperIds: ['ann'] })
    if (first.status !== 'waiting') throw new Error(first.status)
    expect(first.readyAt.getTime() - NOW.getTime()).toBe(RECOVERY_WAIT_DAYS * 86_400_000)
    // Asking again neither restarts the clock nor tells the keepers again.
    expect(await claim('bob')).toMatchObject({ readyAt: first.readyAt, keeperIds: [] })

    expect(await keeperIds()).toEqual(['ann'])
    expect(await getMantel(db, 'bob', MANTEL)).toBeNull()
    expect(await recoveriesOf(db, 'ann', MANTEL)).toMatchObject([{ name: 'bob' }])
    expect(await recoveriesOf(db, 'bob', MANTEL)).toEqual([])
    expect(await myRecoveries(db, 'bob', NOW)).toMatchObject([{ mantelName: 'Leo', ready: false }])
  })

  it('cannot be finished before the wait is over, or by anyone but the claimant', async () => {
    await claim('bob')
    const [row] = await db.select().from(mantelRecoveries)

    expect(await finishRecovery(db, 'bob', row!.id, NOW)).toBe('not-ready')
    expect(await finishRecovery(db, 'cal', row!.id, AFTER)).toBe('gone')
    expect(await keeperIds()).toEqual(['ann'])
  })

  it('seats the claimant after the wait, with the copy of the key they made', async () => {
    await claim('bob')
    const [row] = await db.select().from(mantelRecoveries)

    expect(await myRecoveries(db, 'bob', AFTER)).toMatchObject([{ ready: true }])
    expect(await finishRecovery(db, 'bob', row!.id, AFTER)).toBe('seated')
    expect(await finishRecovery(db, 'bob', row!.id, AFTER)).toBe('gone')
    expect(await keeperIds()).toEqual(['ann', 'bob'])
    expect(await getMantel(db, 'bob', MANTEL)).toMatchObject({ wrappedKey: keeperWrap('bob-new') })
    expect(await myRecoveries(db, 'bob', AFTER)).toEqual([])
  })

  it('is cancelled by any keeper, or taken back by the claimant, and then stands for nothing', async () => {
    await claim('bob')
    const [row] = await db.select().from(mantelRecoveries)

    expect(await cancelRecovery(db, 'cal', row!.id, NOW)).toBe(false)
    expect(await cancelRecovery(db, 'ann', row!.id, NOW)).toBe(true)
    expect(await cancelRecovery(db, 'ann', row!.id, NOW)).toBe(false)
    expect(await finishRecovery(db, 'bob', row!.id, AFTER)).toBe('gone')
    expect(await keeperIds()).toEqual(['ann'])

    await claim('cal')
    const mine = (await db.select().from(mantelRecoveries)).find((r) => r.claimantId === 'cal')!
    expect(await cancelRecovery(db, 'cal', mine.id, NOW)).toBe(true)
    expect(await recoveriesOf(db, 'ann', MANTEL)).toEqual([])
  })
})

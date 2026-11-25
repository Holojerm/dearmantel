// Using a mantel's recovery code. The code is on paper, kept with the papers
// that matter. It opens the copy of the mantel's key that is locked under it,
// and it derives a proof the server can check without ever seeing the code.
//
// A keeper who uses it gets their own access back at once: nothing about who
// keeps the mantel changes. Anyone else is asking to become a keeper without
// the keepers' vote, so it does not take effect at once. Every keeper is told,
// any of them can cancel it, and only after the wait does it stand.

import { and, eq, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'

import { sha256Hex } from '#server/utils/hash'

import { FOUNDER_ROLE, RECOVERY_WAIT_DAYS, type MantelKind } from '../../shared/utils/mantel-format'
import { batchGuard, isGuardFailure } from './batch-guard'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'

const DAY_MS = 24 * 60 * 60 * 1000

async function mantelFor(db: KeysDb, proof: string) {
  const { mantels } = tables
  const [mantel] = await db
    .select()
    .from(mantels)
    .where(eq(mantels.recoveryProofHash, await sha256Hex(proof)))
    .limit(1)
  return mantel && !mantel.handedOverAt ? mantel : null
}

async function hasKeys(db: KeysDb, userId: string): Promise<boolean> {
  const { userKeys } = tables
  const [row] = await db
    .select({ userId: userKeys.userId })
    .from(userKeys)
    .where(eq(userKeys.userId, userId))
    .limit(1)
  return Boolean(row)
}

/**
 * The mantel a recovery code belongs to, with the copy of its key that only
 * the code opens. Presenting the proof is presenting the code.
 */
export async function findByRecoveryProof(db: KeysDb, proof: string) {
  const { mantelKeyWraps } = tables
  const mantel = await mantelFor(db, proof)
  if (!mantel) return null
  const [wrap] = await db
    .select({ wrapped: mantelKeyWraps.wrapped })
    .from(mantelKeyWraps)
    .where(and(eq(mantelKeyWraps.mantelId, mantel.id), eq(mantelKeyWraps.kind, 'recovery')))
    .limit(1)
  if (!wrap) return null
  // The public key, so the browser can tell the copy holds the mantel's own key.
  return {
    mantelId: mantel.id,
    name: mantel.name,
    publicKey: mantel.publicKey,
    recoveryWrap: wrap.wrapped,
  }
}

// Every copy held for one person: the ordinary one, and after a re-key the
// two it is made from. A copy opened with the recovery code replaces them all.
const heldBy = (mantelId: string, userId: string) =>
  and(eq(tables.mantelKeyWraps.mantelId, mantelId), eq(tables.mantelKeyWraps.keeperId, userId))

const codeIs = (mantelId: string, proofHash: string) =>
  sql`EXISTS (SELECT 1 FROM mantels WHERE id = ${mantelId} AND recovery_proof_hash = ${proofHash})`

export type ClaimResult =
  | { status: 'restored'; mantelId: string }
  | { status: 'waiting'; mantelId: string; name: string; readyAt: Date; keeperIds: string[] }
  | { status: 'unknown' | 'no-keys' }

/**
 * Takes the copy of the mantel's key the claimant's browser wrapped to them.
 * A keeper's replaces their own copy at once. Anyone else's waits.
 */
export async function claimRecovery(
  db: KeysDb,
  claimantId: string,
  claim: { proof: string; wrapped: string },
  now: Date,
): Promise<ClaimResult> {
  const { mantelKeyWraps, mantelRecoveries } = tables
  const mantel = await mantelFor(db, claim.proof)
  if (!mantel) return { status: 'unknown' }
  const proofHash = await sha256Hex(claim.proof)
  if (!(await hasKeys(db, claimantId))) return { status: 'no-keys' }
  const keeperIds = (await keepersOf(db, mantel.id)).map((keeper) => keeper.userId)

  if (keeperIds.includes(claimantId)) {
    try {
      await db.batch([
        // A re-key replaces the code. A copy opened with the old one is of the old key.
        batchGuard(db, codeIs(mantel.id, proofHash)),
        // And they still keep it: a copy stored for someone just removed
        // would be a keeper's copy with no keeper.
        batchGuard(
          db,
          sql`EXISTS (SELECT 1 FROM mantel_keepers WHERE mantel_id = ${mantel.id} AND user_id = ${claimantId} AND left_at IS NULL)`,
        ),
        db.delete(mantelKeyWraps).where(heldBy(mantel.id, claimantId)),
        db.insert(mantelKeyWraps).values({
          mantelId: mantel.id,
          kind: 'keeper',
          keeperId: claimantId,
          wrapped: claim.wrapped,
          createdAt: now,
        }),
      ])
    } catch (error) {
      if (isGuardFailure(error)) return { status: 'unknown' }
      throw error
    }
    return { status: 'restored', mantelId: mantel.id }
  }

  const open = and(
    eq(mantelRecoveries.mantelId, mantel.id),
    eq(mantelRecoveries.claimantId, claimantId),
    isNull(mantelRecoveries.cancelledAt),
    isNull(mantelRecoveries.completedAt),
  )
  const [waiting] = await db.select().from(mantelRecoveries).where(open).limit(1)
  if (waiting) {
    // Asking again does not restart the clock or tell the keepers twice.
    return {
      status: 'waiting',
      mantelId: mantel.id,
      name: mantel.name,
      readyAt: waiting.readyAt,
      keeperIds: [],
    }
  }
  const readyAt = new Date(now.getTime() + RECOVERY_WAIT_DAYS * DAY_MS)
  try {
    await db.batch([
      // A claim stored after a re-key would wait out its thirty days holding the old key.
      batchGuard(db, codeIs(mantel.id, proofHash)),
      db.insert(mantelRecoveries).values({
        mantelId: mantel.id,
        claimantId,
        wrapped: claim.wrapped,
        readyAt,
        createdAt: now,
      }),
    ])
  } catch (error) {
    if (isGuardFailure(error)) return { status: 'unknown' }
    throw error
  }
  return { status: 'waiting', mantelId: mantel.id, name: mantel.name, readyAt, keeperIds }
}

/** A keeper cancels a claim on their mantel, or the claimant takes theirs back. */
export async function cancelRecovery(
  db: KeysDb,
  userId: string,
  recoveryId: string,
  now: Date,
): Promise<boolean> {
  const { mantelRecoveries } = tables
  const [claim] = await db
    .select()
    .from(mantelRecoveries)
    .where(eq(mantelRecoveries.id, recoveryId))
    .limit(1)
  if (!claim || claim.cancelledAt || claim.completedAt) return false
  const keeperIds = (await keepersOf(db, claim.mantelId)).map((keeper) => keeper.userId)
  if (claim.claimantId !== userId && !keeperIds.includes(userId)) return false
  await db
    .update(mantelRecoveries)
    .set({ cancelledAt: now, cancelledBy: userId, updatedAt: now })
    .where(and(eq(mantelRecoveries.id, recoveryId), isNull(mantelRecoveries.cancelledAt)))
  return true
}

export type FinishResult = 'seated' | 'not-ready' | 'gone'

/** After the wait, with no keeper having cancelled, the claimant becomes a keeper. */
export async function finishRecovery(
  db: KeysDb,
  claimantId: string,
  recoveryId: string,
  now: Date,
): Promise<FinishResult> {
  const { mantels, mantelKeepers, mantelKeyWraps, mantelRecoveries } = tables
  const [claim] = await db
    .select()
    .from(mantelRecoveries)
    .where(and(eq(mantelRecoveries.id, recoveryId), eq(mantelRecoveries.claimantId, claimantId)))
    .limit(1)
  if (!claim || claim.cancelledAt || claim.completedAt) return 'gone'
  if (claim.readyAt > now) return 'not-ready'
  const [mantel] = await db.select().from(mantels).where(eq(mantels.id, claim.mantelId)).limit(1)
  if (!mantel || mantel.handedOverAt) return 'gone'

  const role = FOUNDER_ROLE[mantel.kind as MantelKind]
  const statements: BatchItem<'sqlite'>[] = [
    // A keeper may cancel, or a re-key may void the claim, as this runs.
    batchGuard(
      db,
      sql`EXISTS (SELECT 1 FROM mantel_recoveries WHERE id = ${recoveryId} AND cancelled_at IS NULL AND completed_at IS NULL)`,
    ),
    db
      .insert(mantelKeepers)
      .values({
        mantelId: mantel.id,
        userId: claimantId,
        role,
        addedBy: claimantId,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [mantelKeepers.mantelId, mantelKeepers.userId],
        set: { leftAt: null, role, addedBy: claimantId, updatedAt: now },
      }),
    db.delete(mantelKeyWraps).where(heldBy(mantel.id, claimantId)),
    db.insert(mantelKeyWraps).values({
      mantelId: mantel.id,
      kind: 'keeper',
      keeperId: claimantId,
      wrapped: claim.wrapped,
      createdAt: now,
    }),
    db
      .update(mantelRecoveries)
      .set({ completedAt: now, updatedAt: now })
      .where(eq(mantelRecoveries.id, recoveryId)),
  ]
  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  } catch (error) {
    if (isGuardFailure(error)) return 'gone'
    throw error
  }
  return 'seated'
}

/** Claims waiting on a mantel, for its keepers. */
export async function recoveriesOf(db: KeysDb, keeperId: string, mantelId: string) {
  const { mantelRecoveries, users } = tables
  const keeperIds = (await keepersOf(db, mantelId)).map((keeper) => keeper.userId)
  if (!keeperIds.includes(keeperId)) return []
  const rows = await db
    .select({
      id: mantelRecoveries.id,
      readyAt: mantelRecoveries.readyAt,
      name: users.name,
    })
    .from(mantelRecoveries)
    .leftJoin(users, eq(users.id, mantelRecoveries.claimantId))
    .where(
      and(
        eq(mantelRecoveries.mantelId, mantelId),
        isNull(mantelRecoveries.cancelledAt),
        isNull(mantelRecoveries.completedAt),
      ),
    )
  return rows.map((row) => ({ id: row.id, name: row.name, readyAt: row.readyAt.toISOString() }))
}

/** A person's own claims that are still waiting or ready to finish. */
export async function myRecoveries(db: KeysDb, userId: string, now: Date) {
  const { mantelRecoveries, mantels } = tables
  const rows = await db
    .select({ id: mantelRecoveries.id, readyAt: mantelRecoveries.readyAt, name: mantels.name })
    .from(mantelRecoveries)
    .innerJoin(mantels, eq(mantels.id, mantelRecoveries.mantelId))
    .where(
      and(
        eq(mantelRecoveries.claimantId, userId),
        isNull(mantelRecoveries.cancelledAt),
        isNull(mantelRecoveries.completedAt),
        isNull(mantels.handedOverAt),
      ),
    )
  return rows.map((row) => ({
    id: row.id,
    mantelName: row.name,
    readyAt: row.readyAt.toISOString(),
    ready: row.readyAt <= now,
  }))
}

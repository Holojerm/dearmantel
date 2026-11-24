// A new recovery code for a mantel whose key stays the same. For a printed
// code that was lost or seen by someone it should not have been: the copy of
// the key locked under the old code is replaced, so the old code opens and
// proves nothing, while the key, every keeper's copy, the write link and the
// letters are untouched.
//
// There is one code a mantel, not one a keeper: one 'recovery' copy, and one
// proof hash on the mantel. So a new code is every keeper's new code, and the
// other keepers are told once, on their next visit, that the old one is dead.
//
// What this does not do: if the old code was used, or the key itself got
// out, whoever has it still has the key. Only a re-key (rekey.ts) helps then.
// What the server cannot check: that the new copy really is the key locked
// under the new code. As with a re-key, the keeper doing it is trusted with
// the key already.

import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { PUBLIC_KEY_PATTERN, WRAPPED_KEY_PATTERN } from '../../shared/utils/key-format'
import { batchGuard, isGuardFailure, mantelKeyVersionIs } from './batch-guard'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'

export const newRecoveryCodeSchema = z.object({
  mantelId: z.string().uuid(),
  /** The version and public half of the key this browser opened and wrapped. */
  keyVersion: z.number().int().min(1),
  publicKey: z.string().regex(PUBLIC_KEY_PATTERN),
  recoveryWrap: z.string().regex(WRAPPED_KEY_PATTERN),
  recoveryProofHash: z.string().regex(/^[0-9a-f]{64}$/),
})
export type NewRecoveryCode = z.infer<typeof newRecoveryCodeSchema>

export type NewRecoveryCodeResult = 'replaced' | 'not-keeper' | 'rekey-due' | 'changed'

/** Replaces the mantel's recovery code, or refuses and stores nothing. */
export async function replaceMantelRecoveryCode(
  db: KeysDb,
  keeperId: string,
  input: NewRecoveryCode,
  now: Date,
): Promise<NewRecoveryCodeResult> {
  const { mantels, mantelKeepers, mantelKeyWraps, mantelRecoveries } = tables
  const { mantelId } = input
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return 'not-keeper'
  const [mantel] = await db.select().from(mantels).where(eq(mantels.id, mantelId)).limit(1)
  if (!mantel || mantel.closedAt) return 'not-keeper'
  // Someone who left may hold the key: a new code alone would leave it with
  // them. The re-key makes a new code as well.
  if (mantel.rekeyDueAt) return 'rekey-due'
  if (
    mantel.keyVersion !== input.keyVersion ||
    mantel.publicKey !== input.publicKey ||
    mantel.recoveryProofHash === input.recoveryProofHash
  ) {
    return 'changed'
  }
  const [own] = await db
    .select({ id: mantelKeyWraps.id })
    .from(mantelKeyWraps)
    .where(
      and(
        eq(mantelKeyWraps.mantelId, mantelId),
        eq(mantelKeyWraps.kind, 'keeper'),
        eq(mantelKeyWraps.keeperId, keeperId),
      ),
    )
    .limit(1)
  if (!own) return 'changed'

  const ofMantel = eq(mantelKeyWraps.mantelId, mantelId)
  try {
    await db.batch([
      batchGuard(db, mantelKeyVersionIs(mantelId, input.keyVersion)),
      // Nobody left while the browser worked, and this keeper still keeps it.
      batchGuard(
        db,
        sql`EXISTS (SELECT 1 FROM mantels WHERE id = ${mantelId} AND rekey_due_at IS NULL AND closed_at IS NULL)
          AND EXISTS (SELECT 1 FROM mantel_keepers WHERE mantel_id = ${mantelId} AND user_id = ${keeperId} AND left_at IS NULL)`,
      ),
      db.delete(mantelKeyWraps).where(and(ofMantel, eq(mantelKeyWraps.kind, 'recovery'))),
      db
        .insert(mantelKeyWraps)
        .values({ mantelId, kind: 'recovery', wrapped: input.recoveryWrap, createdAt: now }),
      db
        .update(mantels)
        .set({ recoveryProofHash: input.recoveryProofHash, updatedAt: now })
        .where(eq(mantels.id, mantelId)),
      // A claim made with the old code stands on a code that is now dead.
      db
        .update(mantelRecoveries)
        .set({ cancelledAt: now, cancelledBy: keeperId, updatedAt: now })
        .where(
          and(
            eq(mantelRecoveries.mantelId, mantelId),
            isNull(mantelRecoveries.cancelledAt),
            isNull(mantelRecoveries.completedAt),
          ),
        ),
      db
        .update(mantelKeepers)
        .set({ recoveryCodeReplacedAt: now, updatedAt: now })
        .where(
          and(
            eq(mantelKeepers.mantelId, mantelId),
            ne(mantelKeepers.userId, keeperId),
            isNull(mantelKeepers.leftAt),
          ),
        ),
      // This keeper has the new code in hand: an older notice is out of date.
      db
        .update(mantelKeepers)
        .set({ recoveryCodeReplacedAt: null })
        .where(and(eq(mantelKeepers.mantelId, mantelId), eq(mantelKeepers.userId, keeperId))),
    ])
  } catch (error) {
    if (isGuardFailure(error)) return 'changed'
    throw error
  }
  return 'replaced'
}

/**
 * For the mantel's page: when another keeper replaced the recovery code, if
 * this keeper has not been told yet. Reading it is the telling, so it is
 * cleared here.
 */
export async function takeRecoveryCodeNotice(
  db: KeysDb,
  keeperId: string,
  mantelId: string,
): Promise<Date | null> {
  const { mantelKeepers } = tables
  const mine = and(
    eq(mantelKeepers.mantelId, mantelId),
    eq(mantelKeepers.userId, keeperId),
    isNull(mantelKeepers.leftAt),
  )
  const [row] = await db
    .select({ at: mantelKeepers.recoveryCodeReplacedAt })
    .from(mantelKeepers)
    .where(mine)
    .limit(1)
  if (!row?.at) return null
  await db.update(mantelKeepers).set({ recoveryCodeReplacedAt: null }).where(mine)
  return row.at
}

// Changing a mantel's key after a keeper stops keeping it. Removing a keeper
// deletes their wrapped copy here, but they may have kept the key itself; with
// a copy of the database they could open the mantel's letters, sealed ones
// included. A re-key makes that copy open nothing kept here.
//
// A keeper who remains does the work in their browser: a new key pair, a new
// recovery code, and every letter key held for the mantel wrapped again to the
// new key. The server stores the result in one transaction and never sees a
// key. Nobody who still keeps the mantel is shut out: for each other keeper
// the browser leaves the new key locked under two things at once, that
// keeper's account key and the mantel's key from before. The server has
// neither; the person who left has only the second.
//
// A keeper may not visit between two re-keys. Their hand-over is then a
// chain, one link per re-key, each locked under the key the link before it
// opens (`HANDOVER_SEPARATOR`). Their own copy from before the first of them
// stays as `previous`, and is what opens the first link.
//
// What the server cannot check: that the wrapped keys it is handed are good.
// A keeper doing this is trusted with the mantel's letters, as they already
// are with its key.
//
// This file owns what the keys layer stores. The letters layer adds the
// letter keys and the write link to the same batch
// (layers/letters/server/utils/kept-rekey.ts).

import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { PUBLIC_KEY_PATTERN, WRAPPED_KEY_PATTERN } from '../../shared/utils/key-format'
import { HANDOVER_SEPARATOR, KEEPER_WRAP_PATTERN } from '../../shared/utils/mantel-format'
import { batchGuard, isGuardFailure, mantelKeyVersionIs } from './batch-guard'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'

const keeperWrap = z.string().regex(KEEPER_WRAP_PATTERN)

export const rekeySchema = z.object({
  mantelId: z.string().uuid(),
  /** The version of the key this browser opened and worked from. */
  keyVersion: z.number().int().min(1),
  publicKey: z.string().regex(PUBLIC_KEY_PATTERN),
  /** The new private key, wrapped to the keeper doing this. */
  keeperWrap,
  recoveryWrap: z.string().regex(WRAPPED_KEY_PATTERN),
  recoveryProofHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The new private key for each other keeper who holds a copy, by keeper id. */
  handovers: z.record(z.string().min(1).max(64), keeperWrap),
})
export type RekeyInput = z.infer<typeof rekeySchema>

export const settleHandoverSchema = z.object({
  mantelId: z.string().uuid(),
  keyVersion: z.number().int().min(1),
  wrapped: keeperWrap,
})

/** The people who keep the mantel now, as a subquery. */
const currentKeepers = (db: KeysDb, mantelId: string) =>
  db
    .select({ id: tables.mantelKeepers.userId })
    .from(tables.mantelKeepers)
    .where(and(eq(tables.mantelKeepers.mantelId, mantelId), isNull(tables.mantelKeepers.leftAt)))

/**
 * The other keepers who hold a copy of the key: the current one ('keeper'),
 * or a hand-over from an earlier re-key they have not opened yet. Each gets
 * the new key. `pending` is which of the two.
 */
async function holdersBeside(db: KeysDb, keeperId: string, mantelId: string) {
  const { mantelKeyWraps, userKeys } = tables
  const others = (await keepersOf(db, mantelId))
    .map((keeper) => keeper.userId)
    .filter((id) => id !== keeperId)
  if (others.length === 0) return []
  const rows = await db
    .select({
      userId: mantelKeyWraps.keeperId,
      kind: mantelKeyWraps.kind,
      publicKey: userKeys.publicKey,
    })
    .from(mantelKeyWraps)
    .innerJoin(userKeys, eq(userKeys.userId, mantelKeyWraps.keeperId))
    .where(
      and(
        eq(mantelKeyWraps.mantelId, mantelId),
        inArray(mantelKeyWraps.kind, ['keeper', 'handover']),
        inArray(mantelKeyWraps.keeperId, others),
      ),
    )
  return rows.map((row) => ({
    userId: row.userId,
    publicKey: row.publicKey,
    pending: row.kind === 'handover',
  }))
}

async function holdsCurrentKey(db: KeysDb, keeperId: string, mantelId: string) {
  const { mantelKeyWraps } = tables
  const [wrap] = await db
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
  return Boolean(wrap)
}

/**
 * What a keeper's browser needs to re-key: the key it must be holding, and
 * the other keepers to hand the new one to. Null unless the mantel is due a
 * re-key and the caller keeps it.
 */
export async function rekeyPlan(db: KeysDb, keeperId: string, mantelId: string) {
  const { mantels } = tables
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return null
  const [mantel] = await db.select().from(mantels).where(eq(mantels.id, mantelId)).limit(1)
  if (!mantel || mantel.handedOverAt || !mantel.rekeyDueAt) return null
  return {
    keyVersion: mantel.keyVersion,
    publicKey: mantel.publicKey,
    others: (await holdersBeside(db, keeperId, mantelId)).map(({ userId, publicKey }) => ({
      userId,
      publicKey,
    })),
  }
}

export type RekeyRefusal = 'not-keeper' | 'not-due' | 'changed' | 'keepers-changed'

/**
 * The statements that put a new key in place, for the caller to run in one
 * batch with its own. They are guarded: if the mantel was re-keyed, or the
 * keepers holding a copy changed, after this was checked, the batch fails
 * (`isGuardFailure`) and nothing is stored.
 */
export async function rekeyStatements(
  db: KeysDb,
  keeperId: string,
  input: RekeyInput,
  now: Date,
): Promise<{ status: 'ready'; statements: BatchItem<'sqlite'>[] } | { status: RekeyRefusal }> {
  const { mantels, mantelKeyWraps, mantelRecoveries } = tables
  const { mantelId } = input
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return { status: 'not-keeper' }
  const [mantel] = await db.select().from(mantels).where(eq(mantels.id, mantelId)).limit(1)
  if (!mantel || mantel.handedOverAt || !mantel.rekeyDueAt) return { status: 'not-due' }
  // The same key again would mark the mantel as re-keyed and change nothing.
  if (mantel.keyVersion !== input.keyVersion || mantel.publicKey === input.publicKey) {
    return { status: 'changed' }
  }
  if (!(await holdsCurrentKey(db, keeperId, mantelId))) return { status: 'changed' }

  const others = await holdersBeside(db, keeperId, mantelId)
  const handed = Object.keys(input.handovers)
  if (handed.length !== others.length || others.some((other) => !input.handovers[other.userId])) {
    return { status: 'keepers-changed' }
  }

  const ofMantel = eq(mantelKeyWraps.mantelId, mantelId)
  const holders = JSON.stringify([keeperId, ...others.map((other) => other.userId)])
  const held = sql`
    FROM mantel_key_wraps AS held
    WHERE held.mantel_id = ${mantelId}
      AND held.kind IN ('keeper', 'handover')
      AND held.keeper_id IN (
        SELECT user_id FROM mantel_keepers WHERE mantel_id = ${mantelId} AND left_at IS NULL
      )`
  const statements: BatchItem<'sqlite'>[] = [
    batchGuard(db, mantelKeyVersionIs(mantelId, input.keyVersion)),
    // The keepers holding a copy are exactly the ones just read: nobody was
    // seated, removed or restored while the browser worked.
    batchGuard(
      db,
      sql`(SELECT count(*) ${held}) = ${others.length + 1}
        AND NOT EXISTS (
          SELECT 1 ${held} AND held.keeper_id NOT IN (SELECT value FROM json_each(${holders}))
        )`,
    ),
    // The old recovery copy, this keeper's own copies, and anything held for
    // someone who no longer keeps the mantel.
    db
      .delete(mantelKeyWraps)
      .where(
        and(
          ofMantel,
          or(
            eq(mantelKeyWraps.keeperId, keeperId),
            notInArray(mantelKeyWraps.keeperId, currentKeepers(db, mantelId)),
          ),
        ),
      ),
    // A keeper who has not opened an earlier hand-over gets one more link.
    ...others
      .filter((other) => other.pending)
      .map((other) =>
        db
          .update(mantelKeyWraps)
          .set({
            wrapped: sql`${mantelKeyWraps.wrapped} || ${HANDOVER_SEPARATOR} || ${input.handovers[other.userId]!}`,
            updatedAt: now,
          })
          .where(
            and(
              ofMantel,
              eq(mantelKeyWraps.kind, 'handover'),
              eq(mantelKeyWraps.keeperId, other.userId),
            ),
          ),
      ),
    // What the other keepers hold as current is now the key from before.
    db
      .update(mantelKeyWraps)
      .set({ kind: 'previous', updatedAt: now })
      .where(and(ofMantel, eq(mantelKeyWraps.kind, 'keeper'))),
    // One row a statement: D1 binds at most a hundred values.
    ...others
      .filter((other) => !other.pending)
      .map((other) =>
        db.insert(mantelKeyWraps).values({
          mantelId,
          kind: 'handover',
          keeperId: other.userId,
          wrapped: input.handovers[other.userId]!,
          createdAt: now,
        }),
      ),
    db.insert(mantelKeyWraps).values([
      { mantelId, kind: 'keeper', keeperId, wrapped: input.keeperWrap, createdAt: now },
      { mantelId, kind: 'recovery', wrapped: input.recoveryWrap, createdAt: now },
    ]),
    // A claim made with the old code holds a copy of the old key.
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
      .update(mantels)
      .set({
        publicKey: input.publicKey,
        keyVersion: input.keyVersion + 1,
        recoveryProofHash: input.recoveryProofHash,
        rekeyDueAt: null,
        updatedAt: now,
      })
      .where(eq(mantels.id, mantelId)),
  ]
  return { status: 'ready', statements }
}

/**
 * A keeper's browser has opened the new key left for it and wrapped it to
 * their account in the usual way. That copy replaces the ones it came from.
 */
export async function settleHandover(
  db: KeysDb,
  keeperId: string,
  input: z.infer<typeof settleHandoverSchema>,
  now: Date,
): Promise<'settled' | 'gone'> {
  const { mantelKeyWraps } = tables
  const { mantelId } = input
  const mine = and(eq(mantelKeyWraps.mantelId, mantelId), eq(mantelKeyWraps.keeperId, keeperId))
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return 'gone'
  const [waiting] = await db
    .select({ id: mantelKeyWraps.id })
    .from(mantelKeyWraps)
    .where(and(mine, eq(mantelKeyWraps.kind, 'handover')))
    .limit(1)
  if (!waiting) return 'gone'
  try {
    await db.batch([
      batchGuard(db, mantelKeyVersionIs(mantelId, input.keyVersion)),
      batchGuard(
        db,
        sql`EXISTS (SELECT 1 FROM mantel_key_wraps WHERE mantel_id = ${mantelId} AND keeper_id = ${keeperId} AND kind = 'handover')
          AND EXISTS (SELECT 1 FROM mantel_keepers WHERE mantel_id = ${mantelId} AND user_id = ${keeperId} AND left_at IS NULL)`,
      ),
      db.delete(mantelKeyWraps).where(mine),
      db
        .insert(mantelKeyWraps)
        .values({ mantelId, kind: 'keeper', keeperId, wrapped: input.wrapped, createdAt: now }),
    ])
  } catch (error) {
    if (isGuardFailure(error)) return 'gone'
    throw error
  }
  return 'settled'
}

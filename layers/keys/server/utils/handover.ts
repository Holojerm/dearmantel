// Handing a child's mantel over to the child, as far as keys go. On the
// handover day (handover-date.ts) the child is invited at an address a keeper
// named, accepts from an account with keys, and a keeper's browser wraps the
// mantel's key to the child after the two compare its fingerprint, as when a
// keeper is seated. None of it needs a vote: the day was agreed when it was
// set. The letters then move in the child's browser, and one batch ends the
// mantel's key and its keepers together
// (layers/letters/server/utils/handover-letters.ts).
//
// Any one keeper names the address, and every other keeper is told, so a
// keeper who does not want the mantel handed over cannot stop it, and one who
// names the wrong address cannot do so unseen.

import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'

import { normalizeEmail } from '#server/utils/users'

import { batchGuard, isGuardFailure, mantelKeyVersionIs } from './batch-guard'
import { handoverIsDue, mantelDay } from './handover-date'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'

async function handoverRow(db: KeysDb, mantelId: string) {
  const { mantelHandovers } = tables
  const [row] = await db
    .select()
    .from(mantelHandovers)
    .where(eq(mantelHandovers.mantelId, mantelId))
    .limit(1)
  return row ?? null
}

async function openChildMantel(db: KeysDb, mantelId: string) {
  const { mantels } = tables
  const [mantel] = await db.select().from(mantels).where(eq(mantels.id, mantelId)).limit(1)
  return mantel?.kind === 'child' && !mantel.closedAt ? mantel : null
}

/** Whether the child holds a copy of the mantel's key as it is now. */
const keyGiven = (
  row: { wrapped: string | null; keyVersion: number | null } | null,
  keyVersion: number,
) => Boolean(row?.wrapped) && row?.keyVersion === keyVersion

/** The handover as a keeper sees it. Null for anyone who does not keep a child's mantel. */
export async function handoverForKeeper(db: KeysDb, keeperId: string, mantelId: string, now: Date) {
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return null
  const mantel = await openChildMantel(db, mantelId)
  if (!mantel) return null
  const row = await handoverRow(db, mantelId)
  return {
    handoverOn: mantel.handoverOn,
    due: handoverIsDue(mantel.handoverOn, await mantelDay(db, mantelId, now)),
    // A keeper typed this address, so keepers may see it.
    email: row?.email ?? null,
    namedBy: row?.namedBy ?? null,
    invited: Boolean(row?.invitedAt),
    childId: row?.childId ?? null,
    keyGiven: keyGiven(row, mantel.keyVersion),
  }
}

export type NameChildResult =
  | { result: 'named'; others: string[]; due: boolean }
  | { result: 'not-keeper' | 'not-child' | 'key-given' | 'is-keeper' }

/**
 * Any one keeper names the address the child will be invited at. It can be
 * changed until the child holds the key; a change undoes an acceptance from
 * the old address. `others` are the keepers to tell.
 */
export async function nameChild(
  db: KeysDb,
  keeperId: string,
  input: { mantelId: string; email: string },
  now: Date,
): Promise<NameChildResult> {
  const { mantelHandovers, users } = tables
  const keepers = await keepersOf(db, input.mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return { result: 'not-keeper' }
  const mantel = await openChildMantel(db, input.mantelId)
  if (!mantel?.handoverOn) return { result: 'not-child' }
  const row = await handoverRow(db, input.mantelId)
  if (keyGiven(row, mantel.keyVersion)) return { result: 'key-given' }
  const email = normalizeEmail(input.email)
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  // A keeper already holds the key: the mantel is not handed over to one.
  if (account && keepers.some((keeper) => keeper.userId === account.id)) {
    return { result: 'is-keeper' }
  }
  const fresh = {
    email,
    namedBy: keeperId,
    invitedAt: null,
    childId: null,
    acceptedAt: null,
    wrapped: null,
    keyVersion: null,
    givenBy: null,
    updatedAt: now,
  }
  await db
    .insert(mantelHandovers)
    .values({ mantelId: input.mantelId, ...fresh, createdAt: now })
    .onConflictDoUpdate({ target: mantelHandovers.mantelId, set: fresh })
  return {
    result: 'named',
    others: keepers.map((keeper) => keeper.userId).filter((id) => id !== keeperId),
    due: handoverIsDue(mantel.handoverOn, await mantelDay(db, input.mantelId, now)),
  }
}

async function emailOf(db: KeysDb, userId: string) {
  const { users } = tables
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return user ? normalizeEmail(user.email) : null
}

/**
 * The mantels being handed over to this person: invited at their address and
 * not yet accepted, or accepted by them. Nothing before the handover day.
 */
export async function handoversFor(db: KeysDb, userId: string) {
  const { mantels, mantelHandovers } = tables
  const email = await emailOf(db, userId)
  const rows = await db
    .select({
      mantelId: mantels.id,
      name: mantels.name,
      keyVersion: mantels.keyVersion,
      childId: mantelHandovers.childId,
      wrapped: mantelHandovers.wrapped,
      given: mantelHandovers.keyVersion,
    })
    .from(mantelHandovers)
    .innerJoin(mantels, eq(mantels.id, mantelHandovers.mantelId))
    .where(
      and(
        isNull(mantels.closedAt),
        isNull(mantelHandovers.completedAt),
        or(
          eq(mantelHandovers.childId, userId),
          and(
            isNull(mantelHandovers.childId),
            isNotNull(mantelHandovers.invitedAt),
            eq(mantelHandovers.email, email ?? ''),
          ),
        ),
      ),
    )
  return rows.map((row) => ({
    mantelId: row.mantelId,
    name: row.name,
    accepted: row.childId === userId,
    keyGiven: row.childId === userId && keyGiven({ ...row, keyVersion: row.given }, row.keyVersion),
  }))
}

export type AcceptHandoverResult = 'accepted' | 'gone' | 'no-keys'

/** The child accepts, from the account with the address they were invited at. */
export async function acceptHandover(
  db: KeysDb,
  userId: string,
  mantelId: string,
  now: Date,
): Promise<AcceptHandoverResult> {
  const { mantelHandovers, userKeys } = tables
  const offered = (await handoversFor(db, userId)).find((row) => row.mantelId === mantelId)
  if (!offered) return 'gone'
  if (offered.accepted) return 'accepted'
  const [keys] = await db
    .select({ userId: userKeys.userId })
    .from(userKeys)
    .where(eq(userKeys.userId, userId))
    .limit(1)
  if (!keys) return 'no-keys'
  if ((await keepersOf(db, mantelId)).some((keeper) => keeper.userId === userId)) return 'gone'
  const email = await emailOf(db, userId)
  await db
    .update(mantelHandovers)
    .set({ childId: userId, acceptedAt: now, email: null, updatedAt: now })
    .where(
      and(
        eq(mantelHandovers.mantelId, mantelId),
        isNull(mantelHandovers.childId),
        eq(mantelHandovers.email, email ?? ''),
      ),
    )
  return 'accepted'
}

/** The child's public key, for a keeper's browser to show its fingerprint and wrap to. */
export async function handoverSeat(db: KeysDb, keeperId: string, mantelId: string, now: Date) {
  const { userKeys } = tables
  const view = await handoverForKeeper(db, keeperId, mantelId, now)
  if (!view?.childId) return null
  const [keys] = await db
    .select({ publicKey: userKeys.publicKey })
    .from(userKeys)
    .where(eq(userKeys.userId, view.childId))
    .limit(1)
  return keys ? { childId: view.childId, publicKey: keys.publicKey } : null
}

export type GiveKeyResult = 'given' | 'not-ready'

/**
 * Stores the copy of the mantel's key a keeper's browser wrapped to the child
 * after the fingerprints matched. Refused if the mantel was re-keyed since
 * that browser opened it, or the child changed.
 */
export async function giveHandoverKey(
  db: KeysDb,
  keeperId: string,
  input: { mantelId: string; childId: string; wrapped: string; keyVersion: number },
  now: Date,
): Promise<GiveKeyResult> {
  const { mantelHandovers } = tables
  const seat = await handoverSeat(db, keeperId, input.mantelId, now)
  if (seat?.childId !== input.childId) return 'not-ready'
  try {
    await db.batch([
      batchGuard(db, mantelKeyVersionIs(input.mantelId, input.keyVersion)),
      db
        .update(mantelHandovers)
        .set({
          wrapped: input.wrapped,
          keyVersion: input.keyVersion,
          givenBy: keeperId,
          updatedAt: now,
        })
        .where(
          and(
            eq(mantelHandovers.mantelId, input.mantelId),
            eq(mantelHandovers.childId, input.childId),
            isNull(mantelHandovers.completedAt),
          ),
        ),
    ])
  } catch (error) {
    if (isGuardFailure(error)) return 'not-ready'
    throw error
  }
  return 'given'
}

/**
 * What the child's browser needs to take the mantel: its public key, and the
 * child's copy of its private key. Null unless a keeper has given them the
 * key as it is now.
 */
export async function handoverToTake(db: KeysDb, childId: string, mantelId: string) {
  const mantel = await openChildMantel(db, mantelId)
  const row = await handoverRow(db, mantelId)
  if (!mantel || row?.childId !== childId || row.completedAt) return null
  if (!keyGiven(row, mantel.keyVersion)) return null
  return {
    mantelId,
    name: mantel.name,
    publicKey: mantel.publicKey,
    keyVersion: mantel.keyVersion,
    wrapped: row.wrapped!,
  }
}

/** True while the handover to this child is ready to finish on the key as it is now. */
export const handoverReady = (mantelId: string, childId: string) => sql`EXISTS (
  SELECT 1 FROM mantel_handovers h JOIN mantels m ON m.id = h.mantel_id
  WHERE h.mantel_id = ${mantelId} AND h.child_id = ${childId} AND h.wrapped IS NOT NULL
    AND h.key_version = m.key_version AND h.completed_at IS NULL AND m.closed_at IS NULL
    AND m.kind = 'child'
)`

/**
 * The keys side of the last step, for the letters layer to put in one batch
 * with its own: every copy of the mantel's key goes, the recovery code's
 * included, every keeper stops keeping it, and the mantel is marked handed
 * over and closed. It cannot be undone. The guard comes first, so none of
 * this lands unless the handover is still ready when the batch runs.
 */
export function handoverCloseStatements(
  db: KeysDb,
  mantelId: string,
  childId: string,
  now: Date,
): BatchItem<'sqlite'>[] {
  const { mantels, mantelKeepers, mantelKeyWraps, mantelProposals, mantelRecoveries } = tables
  const { mantelHandovers } = tables
  return [
    batchGuard(db, handoverReady(mantelId, childId)),
    db.delete(mantelKeyWraps).where(eq(mantelKeyWraps.mantelId, mantelId)),
    db
      .update(mantelKeepers)
      .set({ leftAt: now, updatedAt: now })
      .where(and(eq(mantelKeepers.mantelId, mantelId), isNull(mantelKeepers.leftAt))),
    db
      .update(mantelProposals)
      .set({ outcome: 'withdrawn', settledAt: now, subjectEmail: null, updatedAt: now })
      .where(and(eq(mantelProposals.mantelId, mantelId), isNull(mantelProposals.outcome))),
    db
      .update(mantelRecoveries)
      .set({ cancelledAt: now, updatedAt: now })
      .where(
        and(
          eq(mantelRecoveries.mantelId, mantelId),
          isNull(mantelRecoveries.cancelledAt),
          isNull(mantelRecoveries.completedAt),
        ),
      ),
    db
      .update(mantelHandovers)
      .set({ wrapped: null, completedAt: now, updatedAt: now })
      .where(eq(mantelHandovers.mantelId, mantelId)),
    db
      .update(mantels)
      .set({
        handedOverAt: now,
        handedOverTo: childId,
        closedAt: now,
        recoveryProofHash: null,
        rekeyDueAt: null,
        updatedAt: now,
      })
      .where(and(eq(mantels.id, mantelId), isNull(mantels.closedAt))),
  ]
}

/** Whether the mantel was handed over to this child: a finished batch says so twice. */
export async function handedOverTo(db: KeysDb, mantelId: string) {
  const { mantels } = tables
  const [mantel] = await db
    .select({ to: mantels.handedOverTo })
    .from(mantels)
    .where(eq(mantels.id, mantelId))
    .limit(1)
  return mantel?.to ?? null
}

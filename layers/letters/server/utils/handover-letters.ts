// Handing a child's mantel over, as far as letters go. Once a keeper has
// given the child the mantel's key (layers/keys/server/utils/handover.ts),
// the child's browser opens each letter key the mantel holds and wraps it
// again to the child's own key, a batch at a time. Those copies wait in
// `handover_keys`, read by nothing, so a browser that closes halfway picks up
// where it stopped and nothing has changed for anyone meanwhile.
//
// The last step is one D1 batch, and it cannot be undone: it refuses unless
// every letter key the mantel holds has the child's copy waiting, then files
// those copies as the child's own, moves every delivery, letter and
// correspondence from the mantel's id to the child's, deletes the mantel's
// letter keys, and (from the keys layer) every copy of the mantel's key and
// every keeper. A letter that arrives for the mantel while the child's
// browser works fails the guard, and the browser wraps it and tries again.
// A sealed letter keeps its opening day: the read gate on a person's own
// mantel (seal-gate.ts) withholds it until then.

import { and, eq, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { batchGuard, isGuardFailure } from '#layers/keys/server/utils/batch-guard'
import {
  handedOverTo,
  handoverCloseStatements,
  handoverToTake,
} from '#layers/keys/server/utils/handover'

import { letterIdSchema, letterKeySchema } from '../../shared/utils/letter-doc'
import type { LettersDb } from './people'

/** Letter keys handed to the child's browser at once. */
export const HANDOVER_BATCH = 100

export const handoverMoveSchema = z.object({
  mantelId: z.string().uuid(),
  letterKeys: z
    .array(z.object({ letterId: letterIdSchema, wrappedKey: letterKeySchema }))
    .min(1)
    .max(HANDOVER_BATCH),
})
export type HandoverMove = z.infer<typeof handoverMoveSchema>

// One bound value per JSON list, as in kept-rekey.ts.
const STAGE_ROWS = 12

/** Letter keys the mantel holds that the child has no copy of waiting yet. */
const unstaged = (mantelId: string) => sql`
  SELECT k.letter_id FROM letter_keys k
  WHERE k.user_id = ${mantelId} AND NOT EXISTS (
    SELECT 1 FROM handover_keys h WHERE h.mantel_id = ${mantelId} AND h.letter_id = k.letter_id
  )`

/**
 * The next letter keys for the child's browser to wrap again, and how many
 * are left after them. Null unless the child holds the mantel's key. They
 * include letters still sealed or on their way: a key alone opens nothing,
 * and the letters stay withheld as before.
 */
export async function handoverPlan(db: LettersDb, childId: string, mantelId: string) {
  const { letterKeys } = tables
  const mantel = await handoverToTake(db, childId, mantelId)
  if (!mantel) return null
  const keys = await db
    .select({ letterId: letterKeys.letterId, wrappedKey: letterKeys.wrappedKey })
    .from(letterKeys)
    .where(and(eq(letterKeys.userId, mantelId), sql`letter_id IN (${unstaged(mantelId)})`))
    .orderBy(letterKeys.letterId)
    .limit(HANDOVER_BATCH)
  const [left] = await db.all<{ total: number }>(
    sql`SELECT count(*) AS total FROM (${unstaged(mantelId)})`,
  )
  return { letterKeys: keys, left: Math.max(0, (left?.total ?? 0) - keys.length) }
}

export type HandoverMoveResult = 'moved' | 'not-ready'

/**
 * Keeps the child's copies of a batch of letter keys until the last step.
 * Only for letters the mantel holds a key for; sending one again replaces it.
 */
export async function stageHandoverKeys(
  db: LettersDb,
  childId: string,
  input: HandoverMove,
  now: Date,
): Promise<HandoverMoveResult> {
  const { handoverKeys, letterKeys } = tables
  if (!(await handoverToTake(db, childId, input.mantelId))) return 'not-ready'
  const held = new Set(
    (
      await db
        .select({ letterId: letterKeys.letterId })
        .from(letterKeys)
        .where(eq(letterKeys.userId, input.mantelId))
    ).map((row) => row.letterId),
  )
  const rows = input.letterKeys.filter((key) => held.has(key.letterId))
  if (rows.length === 0) return 'moved'
  const statements: BatchItem<'sqlite'>[] = []
  for (let i = 0; i < rows.length; i += STAGE_ROWS) {
    statements.push(
      db
        .insert(handoverKeys)
        .values(
          rows.slice(i, i + STAGE_ROWS).map((key) => ({
            mantelId: input.mantelId,
            letterId: key.letterId,
            wrappedKey: key.wrappedKey,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [handoverKeys.mantelId, handoverKeys.letterId],
          set: { wrappedKey: sql`excluded.wrapped_key`, updatedAt: now },
        }),
    )
  }
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return 'moved'
}

export type HandoverCloseResult = 'handed-over' | 'letters-left' | 'not-ready'

/**
 * The last step: the mantel becomes the child's. 'letters-left' means a
 * letter key has no copy waiting (one arrived meanwhile), and nothing was
 * done. Run twice, it says 'handed-over' again and changes nothing.
 */
export async function closeHandover(
  db: LettersDb,
  childId: string,
  mantelId: string,
  now: Date,
): Promise<HandoverCloseResult> {
  if ((await handedOverTo(db, mantelId)) === childId) return 'handed-over'
  if (!(await handoverToTake(db, childId, mantelId))) return 'not-ready'
  const statements = [
    batchGuard(db, sql`NOT EXISTS (${unstaged(mantelId)})`),
    ...handoverCloseStatements(db, mantelId, childId, now),
    ...letterStatements(db, mantelId, childId, now),
  ]
  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  } catch (error) {
    if (!isGuardFailure(error)) throw error
    if ((await handedOverTo(db, mantelId)) === childId) return 'handed-over'
    return (await handoverToTake(db, childId, mantelId)) ? 'letters-left' : 'not-ready'
  }
  return 'handed-over'
}

/** Everything held under the mantel's id, moved to the child's. */
function letterStatements(
  db: LettersDb,
  mantelId: string,
  childId: string,
  now: Date,
): BatchItem<'sqlite'>[] {
  const {
    correspondences,
    correspondenceMembers: members,
    deliveries,
    guestLinks,
    handoverKeys,
    invites,
    letterKeys,
    letters,
  } = tables
  return [
    // The child's copies become their keys. A letter they already hold a key
    // for (news of themself, say) keeps the one they have.
    db
      .insert(letterKeys)
      .select(
        db
          .select({
            id: sql<string>`lower(hex(randomblob(16)))`.as('id'),
            letterId: handoverKeys.letterId,
            userId: sql<string>`${childId}`.as('user_id'),
            wrappedKey: handoverKeys.wrappedKey,
            createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
            updatedAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('updated_at'),
          })
          .from(handoverKeys)
          .where(
            and(
              eq(handoverKeys.mantelId, mantelId),
              sql`EXISTS (SELECT 1 FROM letter_keys k
                WHERE k.user_id = ${mantelId} AND k.letter_id = ${handoverKeys.letterId})`,
            ),
          ),
      )
      .onConflictDoNothing(),
    db.delete(letterKeys).where(eq(letterKeys.userId, mantelId)),
    db.delete(handoverKeys).where(eq(handoverKeys.mantelId, mantelId)),
    // Arrived, on its way, or come back: each delivery is now the child's,
    // on their own post. Unless they already had that very copy.
    db.delete(deliveries).where(
      and(
        eq(deliveries.recipientId, mantelId),
        sql`EXISTS (SELECT 1 FROM deliveries d WHERE d.recipient_id = ${childId}
          AND d.letter_id = deliveries.letter_id AND d.kind = deliveries.kind)`,
      ),
    ),
    db
      .update(deliveries)
      .set({ recipientId: childId, updatedAt: now })
      .where(eq(deliveries.recipientId, mantelId)),
    // What a keeper wrote as the child, sent or not, is the child's.
    db
      .update(letters)
      .set({ authorId: childId, updatedAt: now })
      .where(eq(letters.authorId, mantelId)),
    // Each writer now writes to the child, on the child's key and post.
    db.delete(members).where(
      and(
        eq(members.userId, mantelId),
        sql`EXISTS (SELECT 1 FROM correspondence_members c WHERE c.user_id = ${childId}
          AND c.correspondence_id = correspondence_members.correspondence_id)`,
      ),
    ),
    db.update(members).set({ userId: childId, updatedAt: now }).where(eq(members.userId, mantelId)),
    db
      .update(correspondences)
      .set({ mantelId: null, updatedAt: now })
      .where(eq(correspondences.mantelId, mantelId)),
    // News of the child ends: nobody keeps the mantel to write it. Its
    // readers keep what they were sent, still filed as news of the child.
    db
      .update(correspondences)
      .set({ closedAt: now, updatedAt: now })
      .where(
        and(
          isNull(correspondences.closedAt),
          sql`${correspondences.id} IN (SELECT correspondence_id FROM mantel_news
            WHERE mantel_id = ${mantelId})`,
        ),
      ),
    // Invitations keepers sent to write to the mantel, or to read its news.
    db
      .update(invites)
      .set({ expiresAt: now, inviteeEmail: null, updatedAt: now })
      .where(and(eq(invites.mantelId, mantelId), isNull(invites.acceptedAt))),
    db
      .update(guestLinks)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(guestLinks.mantelId, mantelId), isNull(guestLinks.revokedAt))),
  ]
}

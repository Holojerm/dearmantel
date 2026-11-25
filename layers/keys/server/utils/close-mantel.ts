// Closing a kept mantel: a custody change like any other, carried by more
// than half of its keepers (owner decision D2, 2026-11-24). With two keepers
// that is both; a mantel's only keeper closes it alone.
//
// Closing ends writing, not keeping. Nobody can write to the mantel after,
// its keepers included, and nothing new is filed under its id
// (`mantelKeyIs`). Its letters, its key, its keepers and its recovery code
// stay, so the keepers go on reading and keeping copies, and a child's
// mantel is still handed over to the child on its day: no guardian action
// removes a child's letters. Only `handedOverAt` means the letters have gone.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { PROPOSAL_TTL_DAYS } from '../../shared/utils/mantel-format'
import { batchGuard, isGuardFailure } from './batch-guard'
import type { KeysDb } from './keys'
import { afterMantelClosed, mantelClosedStatements } from './mantel-closing'
import { keepersOf } from './mantels'
import { DAY_MS, isCarried, openProposal } from './proposal-votes'

export type ProposeCloseResult =
  | { result: 'proposed'; proposalId: string; closed: boolean }
  | { result: 'not-keeper' | 'closed' | 'already-proposed' }

async function openMantel(db: KeysDb, mantelId: string) {
  const { mantels } = tables
  const [mantel] = await db
    .select({ name: mantels.name, kind: mantels.kind, closedAt: mantels.closedAt })
    .from(mantels)
    .where(eq(mantels.id, mantelId))
    .limit(1)
  return mantel && !mantel.closedAt ? mantel : null
}

/** A keeper proposes closing the mantel. Their vote is cast with it. */
export async function proposeClose(
  db: KeysDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<ProposeCloseResult> {
  const { mantelProposals, mantelVotes } = tables
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return { result: 'not-keeper' }
  if (!(await openMantel(db, mantelId))) return { result: 'closed' }
  const waiting = await db
    .select({ expiresAt: mantelProposals.expiresAt })
    .from(mantelProposals)
    .where(
      and(
        eq(mantelProposals.mantelId, mantelId),
        eq(mantelProposals.kind, 'close'),
        isNull(mantelProposals.outcome),
      ),
    )
  if (waiting.some((row) => row.expiresAt > now)) return { result: 'already-proposed' }

  const proposalId = crypto.randomUUID()
  await db.batch([
    db.insert(mantelProposals).values({
      id: proposalId,
      mantelId,
      kind: 'close',
      proposedBy: keeperId,
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_DAYS * DAY_MS),
      createdAt: now,
    }),
    db.insert(mantelVotes).values({ proposalId, userId: keeperId, createdAt: now }),
  ])
  const closed = await applyCloseIfCarried(db, proposalId, keeperId, now)
  return { result: 'proposed', proposalId, closed }
}

/**
 * Closes the mantel a carried proposal names. One batch: the mantel, the
 * proposal, the proposals about who keeps it (nobody joins or leaves a
 * closed mantel), and what the letters layer ends with it. The guard makes
 * a second vote landing at the same moment close nothing twice.
 */
export async function applyCloseIfCarried(
  db: KeysDb,
  proposalId: string,
  voterId: string,
  now: Date,
): Promise<boolean> {
  const { mantels, mantelProposals } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal || proposal.kind !== 'close') return false
  if (!(await isCarried(db, proposalId, proposal.mantelId))) return false
  const mantel = await openMantel(db, proposal.mantelId)
  if (!mantel) return false
  const { mantelId } = proposal
  const closure = {
    mantelId,
    mantelName: mantel.name,
    kind: mantel.kind,
    closedBy: voterId,
    keeperIds: (await keepersOf(db, mantelId)).map((keeper) => keeper.userId),
    now,
  }
  try {
    await db.batch([
      batchGuard(
        db,
        sql`EXISTS (SELECT 1 FROM mantels WHERE id = ${mantelId} AND closed_at IS NULL)`,
      ),
      db
        .update(mantels)
        .set({ closedAt: now, updatedAt: now })
        .where(and(eq(mantels.id, mantelId), isNull(mantels.closedAt))),
      db
        .update(mantelProposals)
        .set({ outcome: 'done', settledAt: now, updatedAt: now })
        .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome))),
      db
        .update(mantelProposals)
        .set({ outcome: 'withdrawn', settledAt: now, subjectEmail: null, updatedAt: now })
        .where(
          and(
            eq(mantelProposals.mantelId, mantelId),
            inArray(mantelProposals.kind, ['add_keeper', 'remove_keeper']),
            isNull(mantelProposals.outcome),
          ),
        ),
      ...mantelClosedStatements(db, closure),
    ])
  } catch (error) {
    if (isGuardFailure(error)) return false
    throw error
  }
  await afterMantelClosed(db, closure)
  return true
}

// Changing a mantel's key when nobody has left: the keepers think the key got
// out, from a lost device that was signed in for instance. A custody change
// like any other (owner's decision, 2026-11-25): any keeper proposes it, and
// it is carried by more than half of the keepers; a mantel's only keeper
// carries it alone.
//
// Carrying it does no work here. It sets `mantels.rekeyDueAt`, as a keeper
// leaving does, and the re-key itself runs as it does then (rekey.ts): in the
// browser of a keeper who holds the key, guarded on the key's version, and
// asked again on every visit until it is done. A re-key settles any proposal
// still open (`settleRekeyProposals`), so a vote counted after the key has
// changed asks for nothing.
//
// A keeper leaving still sets `rekeyDueAt` with no vote (decision D5): until
// it is changed, the person who left could still read.

import { and, eq, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { PROPOSAL_TTL_DAYS } from '../../shared/utils/mantel-format'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'
import { DAY_MS, isCarried, openProposal } from './proposal-votes'

export type ProposeRekeyResult =
  | { result: 'proposed'; proposalId: string; due: boolean }
  | { result: 'not-keeper' | 'handed-over' | 'already-due' | 'already-proposed' }

async function mantelOf(db: KeysDb, mantelId: string) {
  const { mantels } = tables
  const [mantel] = await db
    .select({ rekeyDueAt: mantels.rekeyDueAt, handedOverAt: mantels.handedOverAt })
    .from(mantels)
    .where(eq(mantels.id, mantelId))
    .limit(1)
  return mantel ?? null
}

/** A keeper proposes changing the mantel's key. Their vote is cast with it. */
export async function proposeRekey(
  db: KeysDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<ProposeRekeyResult> {
  const { mantelProposals, mantelVotes } = tables
  const keepers = await keepersOf(db, mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return { result: 'not-keeper' }
  const mantel = await mantelOf(db, mantelId)
  // Closed is fine: its keepers still keep its letters. Handed over is not.
  if (!mantel || mantel.handedOverAt) return { result: 'handed-over' }
  if (mantel.rekeyDueAt) return { result: 'already-due' }
  const waiting = await db
    .select({ expiresAt: mantelProposals.expiresAt })
    .from(mantelProposals)
    .where(
      and(
        eq(mantelProposals.mantelId, mantelId),
        eq(mantelProposals.kind, 'rekey'),
        isNull(mantelProposals.outcome),
      ),
    )
  if (waiting.some((row) => row.expiresAt > now)) return { result: 'already-proposed' }

  const proposalId = crypto.randomUUID()
  await db.batch([
    db.insert(mantelProposals).values({
      id: proposalId,
      mantelId,
      kind: 'rekey',
      proposedBy: keeperId,
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_DAYS * DAY_MS),
      createdAt: now,
    }),
    db.insert(mantelVotes).values({ proposalId, userId: keeperId, createdAt: now }),
  ])
  const due = await applyRekeyIfCarried(db, proposalId, now)
  return { result: 'proposed', proposalId, due }
}

/**
 * Asks the keepers to change the key once a proposal is carried. True when
 * this call carried it. A handed-over mantel has no key left to change.
 */
export async function applyRekeyIfCarried(
  db: KeysDb,
  proposalId: string,
  now: Date,
): Promise<boolean> {
  const { mantels, mantelProposals } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal || proposal.kind !== 'rekey') return false
  if (!(await isCarried(db, proposalId, proposal.mantelId))) return false
  const mantel = await mantelOf(db, proposal.mantelId)
  const settle = (outcome: 'done' | 'expired') =>
    db
      .update(mantelProposals)
      .set({ outcome, settledAt: now, updatedAt: now })
      .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome)))
  if (!mantel || mantel.handedOverAt) {
    await settle('expired')
    return false
  }
  await db.batch([
    // Already asked for (someone left meanwhile): that re-key is this one.
    db
      .update(mantels)
      .set({ rekeyDueAt: now, updatedAt: now })
      .where(
        and(
          eq(mantels.id, proposal.mantelId),
          isNull(mantels.rekeyDueAt),
          isNull(mantels.handedOverAt),
        ),
      ),
    settle('done'),
  ])
  return true
}

/**
 * For a re-key's batch (rekey.ts): the key is changing, so a proposal to
 * change it has nothing left to ask for.
 */
export const settleRekeyProposals = (db: KeysDb, mantelId: string, now: Date) =>
  db
    .update(tables.mantelProposals)
    .set({ outcome: 'done', settledAt: now, updatedAt: now })
    .where(
      and(
        eq(tables.mantelProposals.mantelId, mantelId),
        eq(tables.mantelProposals.kind, 'rekey'),
        isNull(tables.mantelProposals.outcome),
      ),
    )

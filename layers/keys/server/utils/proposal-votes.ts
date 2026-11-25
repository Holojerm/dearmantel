// Reading custody proposals and their votes. A proposal is carried when more
// than half of the keepers have voted for it, counted against the keepers at
// the moment it takes effect. Shared by every kind of proposal: who keeps a
// mantel (custody.ts), when a child's mantel is handed over (handover-date.ts)
// and closing it (close-mantel.ts).

import { and, eq, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { carries } from '../../shared/utils/mantel-format'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'

export const DAY_MS = 24 * 60 * 60 * 1000

export async function openProposal(db: KeysDb, proposalId: string, now: Date) {
  const { mantelProposals } = tables
  const [proposal] = await db
    .select()
    .from(mantelProposals)
    .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome)))
    .limit(1)
  return proposal && proposal.expiresAt > now ? proposal : null
}

export async function votesFor(
  db: KeysDb,
  proposalId: string,
  keeperIds: string[],
): Promise<number> {
  const { mantelVotes } = tables
  const votes = await db
    .select({ userId: mantelVotes.userId })
    .from(mantelVotes)
    .where(eq(mantelVotes.proposalId, proposalId))
  // Only the votes of people who keep the mantel now.
  return votes.filter((vote) => keeperIds.includes(vote.userId)).length
}

export async function isCarried(db: KeysDb, proposalId: string, mantelId: string) {
  const keeperIds = (await keepersOf(db, mantelId)).map((keeper) => keeper.userId)
  return carries(await votesFor(db, proposalId, keeperIds), keeperIds.length)
}

export async function mantelIsOpen(db: KeysDb, mantelId: string): Promise<boolean> {
  const { mantels } = tables
  const [mantel] = await db
    .select({ closedAt: mantels.closedAt })
    .from(mantels)
    .where(eq(mantels.id, mantelId))
    .limit(1)
  return Boolean(mantel) && !mantel?.closedAt
}

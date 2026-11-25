// The day a child's mantel becomes the child's own. It is set when the mantel
// is opened, so the handover itself needs no vote and keepers who never agree
// cannot hold it back. Moving it, or setting it on a mantel opened before
// there was a day, is a custody change: a proposal carried by more than half
// of the keepers. Once the day has come it does not move.

import { and, eq, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { localParts } from '#layers/post/shared/utils/calendar'

import { isHandoverDay, PROPOSAL_TTL_DAYS } from '../../shared/utils/mantel-format'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'
import { DAY_MS, isCarried, openProposal } from './proposal-votes'

/** Today where the mantel's post arrives: the handover day is on its calendar. */
export async function mantelDay(db: KeysDb, mantelId: string, now: Date): Promise<string> {
  const { postalProfiles } = tables
  const [profile] = await db
    .select({ timeZone: postalProfiles.timeZone })
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, mantelId))
    .limit(1)
  return localParts(now, profile?.timeZone ?? 'UTC').date
}

/** Whether the handover day has come for the mantel. */
export const handoverIsDue = (handoverOn: string | null, today: string) =>
  Boolean(handoverOn) && today >= handoverOn!

async function childMantel(db: KeysDb, mantelId: string) {
  const { mantels } = tables
  const [mantel] = await db
    .select({ kind: mantels.kind, handoverOn: mantels.handoverOn, closedAt: mantels.closedAt })
    .from(mantels)
    .where(eq(mantels.id, mantelId))
    .limit(1)
  return mantel?.kind === 'child' && !mantel.closedAt ? mantel : null
}

export type HandoverDateResult =
  | { result: 'proposed'; proposalId: string; carried: boolean }
  | { result: 'not-keeper' | 'not-child' | 'passed' | 'bad-day' }

/**
 * A keeper proposes the handover day: a new one, or the first for a mantel
 * opened before there was one. Their vote is cast with it, so a mantel's only
 * keeper sets the day at once.
 */
export async function proposeHandoverDate(
  db: KeysDb,
  keeperId: string,
  input: { mantelId: string; on: string },
  now: Date,
): Promise<HandoverDateResult> {
  const { mantelProposals, mantelVotes } = tables
  const keepers = await keepersOf(db, input.mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return { result: 'not-keeper' }
  const mantel = await childMantel(db, input.mantelId)
  if (!mantel) return { result: 'not-child' }
  const today = await mantelDay(db, input.mantelId, now)
  if (handoverIsDue(mantel.handoverOn, today)) return { result: 'passed' }
  if (!isHandoverDay(input.on, today)) return { result: 'bad-day' }

  const proposalId = crypto.randomUUID()
  await db.batch([
    db.insert(mantelProposals).values({
      id: proposalId,
      mantelId: input.mantelId,
      kind: 'handover_date',
      handoverOn: input.on,
      proposedBy: keeperId,
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_DAYS * DAY_MS),
      createdAt: now,
    }),
    db.insert(mantelVotes).values({ proposalId, userId: keeperId, createdAt: now }),
  ])
  const carried = await applyHandoverDateIfCarried(db, proposalId, now)
  return { result: 'proposed', proposalId, carried }
}

/** Sets the day a carried proposal names, unless the day it would replace has come. */
export async function applyHandoverDateIfCarried(
  db: KeysDb,
  proposalId: string,
  now: Date,
): Promise<boolean> {
  const { mantels, mantelProposals } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal || proposal.kind !== 'handover_date' || !proposal.handoverOn) return false
  if (!(await isCarried(db, proposalId, proposal.mantelId))) return false
  const mantel = await childMantel(db, proposal.mantelId)
  const today = await mantelDay(db, proposal.mantelId, now)
  const stands = mantel && !handoverIsDue(mantel.handoverOn, today)
  if (!stands || !isHandoverDay(proposal.handoverOn, today)) {
    await db
      .update(mantelProposals)
      .set({ outcome: 'expired', settledAt: now, updatedAt: now })
      .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome)))
    return false
  }
  await db.batch([
    db
      .update(mantels)
      .set({ handoverOn: proposal.handoverOn, updatedAt: now })
      .where(and(eq(mantels.id, proposal.mantelId), isNull(mantels.closedAt))),
    db
      .update(mantelProposals)
      .set({ outcome: 'done', settledAt: now, updatedAt: now })
      .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome))),
  ])
  return true
}

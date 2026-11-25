// Changes to who keeps a mantel. Every one is a proposal that takes effect
// only when more than half of the keepers have voted for it, counted against
// the keepers at the moment it takes effect. With two keepers that is both:
// neither can remove the other or bring in a third alone.
//
// Adding someone needs three things: the keepers' votes, that person's own
// acceptance, and a keeper's browser wrapping the mantel's key to them. The
// server can do none of the third, so it cannot seat a keeper by itself.

import { and, eq, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { normalizeEmail } from '#server/utils/users'

import { carries, PROPOSAL_TTL_DAYS, type KeeperRole } from '../../shared/utils/mantel-format'
import { batchGuard, isGuardFailure, mantelKeyVersionIs } from './batch-guard'
import { applyCloseIfCarried } from './close-mantel'
import { applyHandoverDateIfCarried } from './handover-date'
import { keeperRemovalStatements } from './keeper-removal'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'
import { DAY_MS, isCarried, mantelIsOpen, openProposal } from './proposal-votes'

export type ProposeResult =
  | { result: 'proposed'; proposalId: string }
  | { result: 'not-keeper' | 'closed' | 'already-keeper' | 'not-a-keeper' }

/**
 * Offers a keeper's seat to the holder of an address. The proposer's vote is
 * cast with it. Nothing here says whether that address has an account.
 */
export async function proposeKeeper(
  db: KeysDb,
  proposerId: string,
  input: { mantelId: string; email: string; role: KeeperRole },
  now: Date,
): Promise<ProposeResult> {
  const { mantelProposals, mantelVotes, users } = tables
  const keepers = await keepersOf(db, input.mantelId)
  if (!keepers.some((keeper) => keeper.userId === proposerId)) return { result: 'not-keeper' }
  if (!(await mantelIsOpen(db, input.mantelId))) return { result: 'closed' }
  const email = normalizeEmail(input.email)
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (account && keepers.some((keeper) => keeper.userId === account.id)) {
    return { result: 'already-keeper' }
  }
  const proposalId = crypto.randomUUID()
  await db.batch([
    db.insert(mantelProposals).values({
      id: proposalId,
      mantelId: input.mantelId,
      kind: 'add_keeper',
      subjectEmail: email,
      role: input.role,
      proposedBy: proposerId,
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_DAYS * DAY_MS),
      createdAt: now,
    }),
    db.insert(mantelVotes).values({ proposalId, userId: proposerId, createdAt: now }),
  ])
  return { result: 'proposed', proposalId }
}

/** Proposes that a keeper stop keeping the mantel. It takes effect when carried. */
export async function proposeRemoval(
  db: KeysDb,
  proposerId: string,
  input: { mantelId: string; keeperId: string },
  now: Date,
): Promise<ProposeResult> {
  const { mantelProposals, mantelVotes } = tables
  const keepers = await keepersOf(db, input.mantelId)
  if (!keepers.some((keeper) => keeper.userId === proposerId)) return { result: 'not-keeper' }
  if (!keepers.some((keeper) => keeper.userId === input.keeperId)) {
    return { result: 'not-a-keeper' }
  }
  if (!(await mantelIsOpen(db, input.mantelId))) return { result: 'closed' }
  const proposalId = crypto.randomUUID()
  await db.batch([
    db.insert(mantelProposals).values({
      id: proposalId,
      mantelId: input.mantelId,
      kind: 'remove_keeper',
      subjectId: input.keeperId,
      proposedBy: proposerId,
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_DAYS * DAY_MS),
      createdAt: now,
    }),
    db.insert(mantelVotes).values({ proposalId, userId: proposerId, createdAt: now }),
  ])
  await applyRemovalIfCarried(db, proposalId, now)
  return { result: 'proposed', proposalId }
}

async function applyRemovalIfCarried(db: KeysDb, proposalId: string, now: Date): Promise<boolean> {
  const { mantels, mantelProposals, mantelKeepers, mantelKeyWraps } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal || proposal.kind !== 'remove_keeper' || !proposal.subjectId) return false
  if (!(await isCarried(db, proposalId, proposal.mantelId))) return false
  const keepers = await keepersOf(db, proposal.mantelId)
  // A mantel always has a keeper: the last one is not removed by a vote.
  if (keepers.length <= 1) return false
  await db.batch([
    db
      .update(mantelKeepers)
      .set({ leftAt: now, updatedAt: now })
      .where(
        and(
          eq(mantelKeepers.mantelId, proposal.mantelId),
          eq(mantelKeepers.userId, proposal.subjectId),
          isNull(mantelKeepers.leftAt),
        ),
      ),
    // Every copy held for them, whatever its kind. The recovery copy's
    // `keeperId` is '', so it stays.
    db
      .delete(mantelKeyWraps)
      .where(
        and(
          eq(mantelKeyWraps.mantelId, proposal.mantelId),
          eq(mantelKeyWraps.keeperId, proposal.subjectId),
        ),
      ),
    // They may have kept the key itself: the keepers who remain are asked to
    // change it (server/utils/rekey.ts).
    db
      .update(mantels)
      .set({ rekeyDueAt: now, updatedAt: now })
      .where(eq(mantels.id, proposal.mantelId)),
    db
      .update(mantelProposals)
      .set({ outcome: 'done', settledAt: now, updatedAt: now })
      .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome))),
    // Their other ways in, such as the letters they wrote as a keeper.
    ...keeperRemovalStatements(db, {
      mantelId: proposal.mantelId,
      userId: proposal.subjectId,
      now,
    }),
  ])
  return true
}

export type VoteResult = 'voted' | 'not-keeper' | 'gone'

/** A keeper's vote for a proposal. Voting twice changes nothing. */
export async function voteForProposal(
  db: KeysDb,
  keeperId: string,
  proposalId: string,
  now: Date,
): Promise<VoteResult> {
  const { mantelVotes } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal) return 'gone'
  const keepers = await keepersOf(db, proposal.mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return 'not-keeper'
  await db
    .insert(mantelVotes)
    .values({ proposalId, userId: keeperId, createdAt: now })
    .onConflictDoNothing()
  await applyRemovalIfCarried(db, proposalId, now)
  await applyHandoverDateIfCarried(db, proposalId, now)
  await applyCloseIfCarried(db, proposalId, keeperId, now)
  return 'voted'
}

export type AcceptSeatResult = 'accepted' | 'gone' | 'not-yours' | 'no-keys'

/**
 * The person a seat was offered to accepts it. The offer was made to an
 * address, so only the account with that address can take it.
 */
export async function acceptSeat(
  db: KeysDb,
  userId: string,
  proposalId: string,
  now: Date,
): Promise<AcceptSeatResult> {
  const { mantelProposals, users, userKeys } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal || proposal.kind !== 'add_keeper') return 'gone'
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user || normalizeEmail(user.email) !== proposal.subjectEmail) return 'not-yours'
  const [keys] = await db
    .select({ userId: userKeys.userId })
    .from(userKeys)
    .where(eq(userKeys.userId, userId))
    .limit(1)
  if (!keys) return 'no-keys'
  await db
    .update(mantelProposals)
    .set({ subjectId: userId, acceptedAt: now, updatedAt: now })
    .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome)))
  return 'accepted'
}

/**
 * What a keeper's browser needs to seat the new keeper: their public key, to
 * show its fingerprint and to wrap the mantel's key to. Null until the
 * proposal is carried and accepted.
 */
export async function seatToFill(db: KeysDb, keeperId: string, proposalId: string, now: Date) {
  const { userKeys } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal || proposal.kind !== 'add_keeper' || !proposal.subjectId) return null
  const keepers = await keepersOf(db, proposal.mantelId)
  if (!keepers.some((keeper) => keeper.userId === keeperId)) return null
  if (!(await isCarried(db, proposalId, proposal.mantelId))) return null
  const [keys] = await db
    .select({ publicKey: userKeys.publicKey })
    .from(userKeys)
    .where(eq(userKeys.userId, proposal.subjectId))
    .limit(1)
  if (!keys) return null
  return {
    mantelId: proposal.mantelId,
    subjectId: proposal.subjectId,
    role: proposal.role,
    publicKey: keys.publicKey,
  }
}

export type GrantSeatResult = 'seated' | 'not-ready'

/**
 * Seats the new keeper with the copy of the mantel's key a keeper's browser
 * wrapped to them, after the two compared the key's fingerprint. `keyVersion`
 * is the version of the key that browser opened: if the mantel has been
 * re-keyed since, the copy is of an old key and nobody is seated.
 */
export async function grantSeat(
  db: KeysDb,
  keeperId: string,
  proposalId: string,
  grant: { wrapped: string; keyVersion: number },
  now: Date,
): Promise<GrantSeatResult> {
  const { mantelProposals, mantelKeepers, mantelKeyWraps } = tables
  const { wrapped } = grant
  const seat = await seatToFill(db, keeperId, proposalId, now)
  if (!seat || !seat.role) return 'not-ready'
  const statements = [
    batchGuard(db, mantelKeyVersionIs(seat.mantelId, grant.keyVersion)),
    db
      .insert(mantelKeepers)
      .values({
        mantelId: seat.mantelId,
        userId: seat.subjectId,
        role: seat.role,
        addedBy: keeperId,
        createdAt: now,
      })
      // Someone who kept it before and left takes their old row back.
      .onConflictDoUpdate({
        target: [mantelKeepers.mantelId, mantelKeepers.userId],
        set: { leftAt: null, role: seat.role, addedBy: keeperId, updatedAt: now },
      }),
    db.insert(mantelKeyWraps).values({
      mantelId: seat.mantelId,
      kind: 'keeper',
      keeperId: seat.subjectId,
      wrapped,
      createdAt: now,
    }),
    db
      .update(mantelProposals)
      .set({ outcome: 'done', settledAt: now, subjectEmail: null, updatedAt: now })
      .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome))),
  ] as const
  try {
    await db.batch(statements)
  } catch (error) {
    if (isGuardFailure(error)) return 'not-ready'
    throw error
  }
  return 'seated'
}

/** The proposer takes a proposal back, or the person offered a seat declines it. */
export async function withdrawProposal(
  db: KeysDb,
  userId: string,
  proposalId: string,
  now: Date,
): Promise<boolean> {
  const { mantelProposals } = tables
  const proposal = await openProposal(db, proposalId, now)
  if (!proposal) return false
  const declining = proposal.kind === 'add_keeper' && proposal.subjectId === userId
  if (proposal.proposedBy !== userId && !declining) return false
  await db
    .update(mantelProposals)
    .set({
      outcome: declining ? 'declined' : 'withdrawn',
      settledAt: now,
      subjectEmail: null,
      updatedAt: now,
    })
    .where(and(eq(mantelProposals.id, proposalId), isNull(mantelProposals.outcome)))
  return true
}

/** Seats offered to this person's address that they can still take or decline. */
export async function offersFor(db: KeysDb, userId: string, now: Date) {
  const { mantelProposals, mantels, users } = tables
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) return []
  const rows = await db
    .select({
      id: mantelProposals.id,
      mantelName: mantels.name,
      kind: mantels.kind,
      role: mantelProposals.role,
      acceptedAt: mantelProposals.acceptedAt,
      expiresAt: mantelProposals.expiresAt,
    })
    .from(mantelProposals)
    .innerJoin(mantels, eq(mantels.id, mantelProposals.mantelId))
    .where(
      and(
        eq(mantelProposals.kind, 'add_keeper'),
        eq(mantelProposals.subjectEmail, normalizeEmail(user.email)),
        isNull(mantelProposals.outcome),
      ),
    )
  return rows
    .filter((row) => row.expiresAt > now)
    .map(({ expiresAt: _expiresAt, acceptedAt, ...row }) => ({
      ...row,
      accepted: Boolean(acceptedAt),
    }))
}

/** A mantel's open proposals, as one of its keepers sees them. */
export async function proposalsOf(db: KeysDb, keeperId: string, mantelId: string, now: Date) {
  const { mantelProposals, mantelVotes } = tables
  const keepers = await keepersOf(db, mantelId)
  const keeperIds = keepers.map((keeper) => keeper.userId)
  if (!keeperIds.includes(keeperId)) return []
  const open = await db
    .select()
    .from(mantelProposals)
    .where(and(eq(mantelProposals.mantelId, mantelId), isNull(mantelProposals.outcome)))
  const proposals = []
  for (const proposal of open.filter((row) => row.expiresAt > now)) {
    const votes = await db
      .select({ userId: mantelVotes.userId })
      .from(mantelVotes)
      .where(eq(mantelVotes.proposalId, proposal.id))
    const counted = votes.filter((vote) => keeperIds.includes(vote.userId))
    proposals.push({
      id: proposal.id,
      kind: proposal.kind as 'add_keeper' | 'remove_keeper' | 'handover_date' | 'close',
      handoverOn: proposal.handoverOn,
      // A keeper typed this address, so keepers may see it.
      email: proposal.subjectEmail,
      subjectId: proposal.subjectId,
      role: proposal.role,
      mine: proposal.proposedBy === keeperId,
      voted: counted.some((vote) => vote.userId === keeperId),
      votes: counted.length,
      keepers: keeperIds.length,
      carried: carries(counted.length, keeperIds.length),
      accepted: Boolean(proposal.acceptedAt),
    })
  }
  return proposals
}

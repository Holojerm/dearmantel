// Correspondences: who writes with whom.

import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import * as tables from '@nuxthub/db/schema'

import type { OpenInviteView, PersonView } from '../../shared/utils/invites'
import { isKeeper } from '#layers/keys/server/utils/mantels'
import { mantelIsOpen } from '#layers/keys/server/utils/proposal-votes'

import type { LettersDb } from './people'

/** The open correspondence two people share, if any. */
export async function openCorrespondenceBetween(
  db: LettersDb,
  a: string,
  b: string,
): Promise<string | null> {
  const { correspondences, correspondenceMembers: members } = tables
  const mine = db
    .select({ id: members.correspondenceId })
    .from(members)
    .where(and(eq(members.userId, a), isNull(members.leftAt)))
  const [row] = await db
    .select({ id: correspondences.id })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(
      and(
        eq(members.userId, b),
        isNull(members.leftAt),
        isNull(correspondences.closedAt),
        inArray(members.correspondenceId, mine),
      ),
    )
    .limit(1)
  return row?.id ?? null
}

/**
 * The correspondence a keeper writes to a mantel they keep in, made on first
 * use. The mantel is its other member, under its own id, so sealing, transit
 * and delivery treat it as they treat a person.
 */
export async function openMantelCorrespondence(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<string | null> {
  const { correspondences, correspondenceMembers: members } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  // Nobody writes to a closed mantel, its keepers included.
  if (!(await mantelIsOpen(db, mantelId))) return null
  const existing = await openCorrespondenceBetween(db, keeperId, mantelId)
  if (existing) return existing
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(correspondences).values({ id, mantelId, createdAt: now, updatedAt: now }),
    db.insert(members).values([
      { correspondenceId: id, userId: keeperId, createdAt: now },
      { correspondenceId: id, userId: mantelId, createdAt: now },
    ]),
  ])
  return id
}

export interface CorrespondenceLabel {
  /** The other person, the kept mantel, the family, or the child whose news it is. */
  name: string
  kind: 'person' | 'mantel' | 'family' | 'news'
  since: Date
}

/**
 * What to call each correspondence from one member's side: the family's name,
 * the kept mantel's, or the other person's. Only open ones the user is in.
 */
export async function correspondenceLabels(
  db: LettersDb,
  userId: string,
  correspondenceIds?: string[],
): Promise<Map<string, CorrespondenceLabel>> {
  const {
    correspondences,
    correspondenceMembers: members,
    people,
    users,
    mantels,
    families,
    mantelNews,
  } = tables
  const newsMantels = alias(mantels, 'news_mantels')
  const labels = new Map<string, CorrespondenceLabel>()
  if (correspondenceIds && correspondenceIds.length === 0) return labels
  const mine = db
    .select({ id: members.correspondenceId })
    .from(members)
    .where(eq(members.userId, userId))
  const rows = await db
    .select({
      correspondenceId: correspondences.id,
      since: correspondences.createdAt,
      mantelId: correspondences.mantelId,
      family: families.name,
      chosen: people.displayName,
      account: users.name,
      mantel: mantels.name,
      news: newsMantels.name,
    })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .leftJoin(families, eq(families.correspondenceId, correspondences.id))
    .leftJoin(mantelNews, eq(mantelNews.correspondenceId, correspondences.id))
    .leftJoin(newsMantels, eq(newsMantels.id, mantelNews.mantelId))
    // The other side is a person, or a kept mantel under its own id.
    .leftJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .leftJoin(mantels, eq(mantels.id, members.userId))
    .where(and(ne(members.userId, userId), inArray(members.correspondenceId, mine)))
    .orderBy(correspondences.createdAt)
  for (const row of rows) {
    if (correspondenceIds && !correspondenceIds.includes(row.correspondenceId)) continue
    if (labels.has(row.correspondenceId)) continue
    labels.set(row.correspondenceId, {
      name: row.family ?? row.news ?? row.chosen ?? row.account ?? row.mantel ?? '',
      kind: row.family ? 'family' : row.news ? 'news' : row.mantelId ? 'mantel' : 'person',
      since: row.since,
    })
  }
  return labels
}

/** The people someone writes with, and the invitations they have waiting. */
export async function listPeople(
  db: LettersDb,
  userId: string,
  now: Date,
): Promise<{ people: PersonView[]; invites: OpenInviteView[] }> {
  const { correspondences, correspondenceMembers: members, invites } = tables
  // Open correspondences the person is still in. A family is listed on its own page.
  const open = await db
    .select({ id: correspondences.id })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(
      and(eq(members.userId, userId), isNull(members.leftAt), isNull(correspondences.closedAt)),
    )
  const labels = await correspondenceLabels(
    db,
    userId,
    open.map((row) => row.id),
  )

  const waiting = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.inviterId, userId),
        isNull(invites.acceptedAt),
        isNull(invites.mantelId),
        isNull(invites.familyId),
      ),
    )
    .orderBy(invites.createdAt)

  return {
    people: [...labels.entries()]
      // A family and a child's news are each listed on a page of their own.
      .filter(([, label]) => label.kind !== 'family' && label.kind !== 'news')
      .map(([correspondenceId, label]) => ({
        correspondenceId,
        name: label.name,
        since: label.since.toISOString(),
      })),
    invites: waiting
      .filter((invite) => invite.expiresAt > now && invite.inviteeEmail)
      .map((invite) => ({
        id: invite.id,
        email: invite.inviteeEmail!,
        sentAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
      })),
  }
}

// The letters side of closing a kept mantel (layers/keys/server/utils/close-mantel.ts).
// As when a person closes a correspondence: nothing new can be written to the
// mantel, letters on their way to it go back to their senders, and letters
// it posted still arrive. What has arrived stays with its keepers.

import { and, eq, inArray, isNotNull, isNull, notInArray, or } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { onMantelClosed, type MantelClosure } from '#layers/keys/server/utils/mantel-closing'
import { returnToSender } from '#layers/post/server/utils/returns'
import { sendEmail } from '#server/utils/email'
import { composeEmail, emailBranding } from '#server/utils/email-templates'

import { mailableMantelName } from '../../shared/utils/invites'
import type { LettersDb } from './people'

/** Every correspondence with the mantel, and its news, closes in the closing batch. */
function closingStatements(db: LettersDb, { mantelId, now }: MantelClosure) {
  const { correspondences, guestLinks, invites, mantelNews } = tables
  return [
    // `closedBy` is the mantel's own id: it closed them, and mail() finds
    // its writers by it.
    db
      .update(correspondences)
      .set({ closedAt: now, closedBy: mantelId, updatedAt: now })
      .where(
        and(
          isNull(correspondences.closedAt),
          or(
            eq(correspondences.mantelId, mantelId),
            inArray(
              correspondences.id,
              db
                .select({ id: mantelNews.correspondenceId })
                .from(mantelNews)
                .where(eq(mantelNews.mantelId, mantelId)),
            ),
          ),
        ),
      ),
    // Invitations to write to it, or to read its news, that nobody took up.
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

/**
 * Sends back what was on its way to the mantel. A letter whose writer has
 * deleted their account has nobody to go back to, so it arrives instead.
 */
export async function returnInTransitToMantel(db: LettersDb, mantelId: string, now: Date) {
  const { deliveries, letters } = tables
  const waiting = await db
    .select({ id: deliveries.id, authorId: letters.authorId })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .where(
      and(
        eq(deliveries.recipientId, mantelId),
        eq(deliveries.kind, 'letter'),
        eq(deliveries.state, 'in_transit'),
        isNotNull(letters.authorId),
      ),
    )
  let returned = 0
  for (const delivery of waiting) {
    if (await returnToSender(db, delivery.id, delivery.authorId, now)) returned += 1
  }
  return returned
}

/** The people who wrote to the mantel and are not its keepers. */
async function writersOf(db: LettersDb, closure: MantelClosure): Promise<string[]> {
  const { correspondences, correspondenceMembers: members, mantelNews } = tables
  const rows = await db
    .selectDistinct({ userId: members.userId })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(
      and(
        eq(correspondences.mantelId, closure.mantelId),
        eq(correspondences.closedBy, closure.mantelId),
        eq(correspondences.closedAt, closure.now),
        isNull(members.leftAt),
        notInArray(members.userId, [closure.mantelId, ...closure.keeperIds]),
        // News readers never wrote to it.
        notInArray(
          correspondences.id,
          db.select({ id: mantelNews.correspondenceId }).from(mantelNews),
        ),
      ),
    )
  return rows.map((row) => row.userId)
}

async function addressesOf(db: LettersDb, userIds: string[]) {
  if (userIds.length === 0) return []
  const rows = await db
    .select({ email: tables.users.email })
    .from(tables.users)
    .where(inArray(tables.users.id, userIds))
  return rows.map((row) => row.email)
}

/** Each writer is told they can no longer write; each other keeper, that it closed. */
async function mail(db: LettersDb, closure: MantelClosure) {
  const brand = emailBranding()
  const mantelName = mailableMantelName(closure.mantelName)
  const subject = `${mantelName}'s mantel is closed`
  for (const to of await addressesOf(db, await writersOf(db, closure))) {
    await sendEmail({
      to,
      ...composeEmail('mantel-closed', subject, brand, {
        mantelName,
        url: `${brand.appUrl}/people`,
      }),
    })
  }
  const others = closure.keeperIds.filter((id) => id !== closure.closedBy)
  for (const to of await addressesOf(db, others)) {
    await sendEmail({
      to,
      ...composeEmail('mantel-closed-keepers', subject, brand, {
        mantelName,
        url: `${brand.appUrl}/mantels/${closure.mantelId}`,
      }),
    })
  }
}

export function registerMantelClosed(): void {
  onMantelClosed({
    key: 'letters',
    statements: closingStatements,
    async after(db, closure) {
      await returnInTransitToMantel(db, closure.mantelId, closure.now)
      await mail(db, closure)
    },
  })
}

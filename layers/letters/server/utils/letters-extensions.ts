// What letters registers with core. Called once per isolate by
// layers/letters/server/plugins/letters.ts; tests call it directly.

import { and, count, eq, inArray, isNull, lt, notInArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { registerAccountContributor, registerPurgeContributor } from '#server/utils/extensions'
import { registerPublicApiRoutes } from '#server/utils/public-routes'

import { onKeeperRemoved } from '#layers/keys/server/utils/keeper-removal'
import { postNow } from '#layers/post/server/utils/clock'

import { returnInTransitTo } from './closing'
import { exportLetters, type AccountExportLetters } from './letters-export'
import type { LettersDb } from './people'
import { photoStore } from './photo-store'
import { removeDraftPhotos, type PhotoStore } from './photos'

declare module '#server/utils/extensions' {
  interface AccountExportSections {
    letters: AccountExportLetters
  }
}

const PURGE_BATCH = 500

/**
 * An invitation nobody accepted is deleted once it expires, and the address
 * it was sent to goes with it.
 */
export async function purgeExpiredInvites(
  db: LettersDb,
  now: Date,
): Promise<{ count: number; truncated: boolean }> {
  const { invites } = tables
  const expired = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(isNull(invites.acceptedAt), lt(invites.expiresAt, now)))
    .limit(PURGE_BATCH)
  if (expired.length === 0) return { count: 0, truncated: false }
  for (let i = 0; i < expired.length; i += 80) {
    const ids = expired.slice(i, i + 80).map((row) => row.id)
    await db.delete(invites).where(inArray(invites.id, ids))
  }
  return { count: expired.length, truncated: expired.length === PURGE_BATCH }
}

export function registerLettersExtensions(photos: PhotoStore = photoStore): void {
  const {
    invites,
    people,
    families,
    correspondences,
    correspondenceMembers: members,
    letters,
    letterKeys,
    deliveries,
  } = tables

  // The invite page works signed out: the link is what its holder has.
  registerPublicApiRoutes([
    { path: '/api/letters/invites/view', methods: ['POST'] },
    // A guest writes to an anniversary mantel from a printed link, signed out.
    { path: '/api/letters/guest/', match: 'prefix', methods: ['POST'] },
  ])

  registerPurgeContributor({
    key: 'invites',
    run: (db, options) => purgeExpiredInvites(db, new Date(options.now ?? Date.now())),
  })

  // A keeper the others vote off stops writing to the mantel: the
  // correspondence they had as a keeper closes. What they already posted
  // still arrives. To write on, a keeper invites them as anyone else.
  onKeeperRemoved({
    key: 'letters',
    statements: (db, { mantelId, userId, now }) => [
      db
        .update(correspondences)
        .set({ closedAt: now, closedBy: userId, updatedAt: now })
        .where(
          and(
            eq(correspondences.mantelId, mantelId),
            isNull(correspondences.closedAt),
            inArray(
              correspondences.id,
              db
                .select({ id: members.correspondenceId })
                .from(members)
                .where(and(eq(members.userId, userId), isNull(members.leftAt))),
            ),
          ),
        ),
    ],
  })

  // Deleting an account follows the paper rule. What the person received,
  // their drafts and their settings go. Letters they sent stay with their
  // recipients, without an author, and the ones already posted still arrive.
  // Letters on their way to them go back to their senders first.
  registerAccountContributor({
    key: 'letters',
    async countForDeletion(db, userId) {
      const [row] = await db
        .select({ total: count() })
        .from(members)
        .where(and(eq(members.userId, userId), isNull(members.leftAt)))
      return row?.total ?? 0
    },
    async beforeDeletion(db, userId) {
      await returnInTransitTo(db, userId, await postNow())
      // Drafts go in the deletion itself; their photo files are not rows.
      await removeDraftPhotos(db, photos, userId)
    },
    exportSection: async (db, userId) => exportLetters(db, userId, await postNow()),
    deletionStatements: (db, userId) => {
      const now = new Date()
      const myDrafts = db
        .select({ id: letters.id })
        .from(letters)
        .where(and(eq(letters.authorId, userId), isNull(letters.sealedAt)))
      const mine = db
        .select({ id: members.correspondenceId })
        .from(members)
        .where(eq(members.userId, userId))
      return [
        db
          .update(correspondences)
          .set({ closedAt: now, closedBy: userId })
          // A family goes on without them: only their own place in it ends.
          .where(
            and(
              isNull(correspondences.closedAt),
              inArray(correspondences.id, mine),
              notInArray(
                correspondences.id,
                db.select({ id: families.correspondenceId }).from(families),
              ),
            ),
          ),
        db
          .update(members)
          .set({ leftAt: now })
          .where(and(eq(members.userId, userId), isNull(members.leftAt))),
        db.delete(invites).where(and(eq(invites.inviterId, userId), isNull(invites.acceptedAt))),
        db.delete(people).where(eq(people.userId, userId)),
        // Drafts: the keys first, while the letters still name them.
        db.delete(letterKeys).where(inArray(letterKeys.letterId, myDrafts)),
        db.delete(letters).where(and(eq(letters.authorId, userId), isNull(letters.sealedAt))),
        // What they received, and their own copies of every letter's key.
        db.delete(deliveries).where(eq(deliveries.recipientId, userId)),
        db.delete(letterKeys).where(eq(letterKeys.userId, userId)),
        // What they sent stays with its recipients, unsigned by any account.
        db.update(letters).set({ authorId: null }).where(eq(letters.authorId, userId)),
      ]
    },
  })
}

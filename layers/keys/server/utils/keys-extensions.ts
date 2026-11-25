// What keys registers with core and with the credentials layer. Called once
// per isolate by layers/keys/server/plugins/keys.ts; tests call it directly.

import { and, count, eq, inArray, isNull, lt } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { onCredentialsPasswordReset } from '#layers/credentials/server/utils/credentials-hooks'
import { registerNoticeAudience } from '#layers/post/server/utils/notice-audience'
import {
  registerAccountContributor,
  registerDeletionGuard,
  registerPurgeContributor,
} from '#server/utils/extensions'

import type { KeysDb } from './keys'
import { soleKeeperBlock } from './sole-keeper'

export interface AccountExportKeys {
  /** The public half of the account's key pair, which letters are sealed to. */
  publicKey: string | null
  /**
   * What the private key is locked under. The locked copies stay on the
   * server: they are no use without the password, passkey or recovery code.
   */
  lockedUnder: { kind: string; addedAt: string }[]
}

declare module '#server/utils/extensions' {
  interface AccountExportSections {
    keys: AccountExportKeys
  }
}

/**
 * Offers of a keeper's seat that nobody took up in time are closed, and the
 * address they were made to is forgotten.
 */
export async function expireMantelProposals(
  db: KeysDb,
  now: Date,
): Promise<{ count: number; truncated: boolean }> {
  const { mantelProposals } = tables
  const expired = await db
    .update(mantelProposals)
    .set({ outcome: 'expired', settledAt: now, subjectEmail: null, updatedAt: now })
    .where(and(isNull(mantelProposals.outcome), lt(mantelProposals.expiresAt, now)))
    .returning({ id: mantelProposals.id })
  return { count: expired.length, truncated: false }
}

export function registerKeysExtensions(): void {
  const {
    userKeys,
    keyWraps,
    mantels,
    mantelKeepers,
    mantelKeyWraps,
    mantelProposals,
    mantelRecoveries,
    mantelHandovers,
  } = tables

  // When mail arrives on a kept mantel, its keepers are the ones to tell.
  registerNoticeAudience(async (db, recipientIds) => {
    const audience = new Map<string, string[]>()
    for (let i = 0; i < recipientIds.length; i += 80) {
      // A mantel whose last keeper deleted their account has nobody to tell.
      // It is never told in its own name.
      const kept = await db
        .select({ id: mantels.id })
        .from(mantels)
        .where(inArray(mantels.id, recipientIds.slice(i, i + 80)))
      for (const mantel of kept) audience.set(mantel.id, [])
      const keepers = await db
        .select({ mantelId: mantelKeepers.mantelId, userId: mantelKeepers.userId })
        .from(mantelKeepers)
        .where(
          and(
            inArray(mantelKeepers.mantelId, recipientIds.slice(i, i + 80)),
            isNull(mantelKeepers.leftAt),
          ),
        )
      for (const keeper of keepers) {
        audience.set(keeper.mantelId, [...(audience.get(keeper.mantelId) ?? []), keeper.userId])
      }
    }
    return audience
  })

  registerPurgeContributor({
    key: 'mantelProposals',
    run: (db, options) => expireMantelProposals(db, new Date(options.now ?? Date.now())),
  })

  // A mantel belongs to the child or the couple it is for, not to its keeper.
  // Its last keeper leaving leaves the letters behind its printed code, so
  // they hand it on first, or show they hold the code (sole-keeper.ts).
  registerDeletionGuard({
    key: 'mantel-keeper',
    check: (db, userId, context) => soleKeeperBlock(db, userId, context?.mantelRecoveryProofs),
  })

  // A reset proves the mailbox, not the old password, so the old password's
  // wrap can never be opened again. It goes in the same batch as the new
  // password. The private key itself is untouched: a device that still holds
  // it, a passkey, or the recovery code brings it back, and letters with it.
  onCredentialsPasswordReset({
    key: 'keys',
    statements: (db, { userId }) => [
      db.delete(keyWraps).where(and(eq(keyWraps.userId, userId), eq(keyWraps.kind, 'password'))),
    ],
  })

  // Deleting the account deletes its keys. Letters it sent stay readable by
  // their recipients, who hold their own wrapped copy of each letter's key.
  registerAccountContributor({
    key: 'keys',
    async countForDeletion(db, userId) {
      const [row] = await db
        .select({ total: count() })
        .from(keyWraps)
        .where(eq(keyWraps.userId, userId))
      return row?.total ?? 0
    },
    async exportSection(db, userId) {
      const [key] = await db
        .select({ publicKey: userKeys.publicKey })
        .from(userKeys)
        .where(eq(userKeys.userId, userId))
        .limit(1)
      const wraps = await db
        .select({ kind: keyWraps.kind, createdAt: keyWraps.createdAt })
        .from(keyWraps)
        .where(eq(keyWraps.userId, userId))
      return {
        publicKey: key?.publicKey ?? null,
        lockedUnder: wraps.map((wrap) => ({
          kind: wrap.kind,
          addedAt: wrap.createdAt.toISOString(),
        })),
      }
    },
    deletionStatements: (db, userId) => [
      // Whoever held the account may still hold each mantel's key, so the
      // keepers who remain are asked to change it. Before the next statement,
      // which is what stops this person being found as a keeper.
      db
        .update(mantels)
        .set({ rekeyDueAt: new Date() })
        .where(
          inArray(
            mantels.id,
            db
              .select({ id: mantelKeepers.mantelId })
              .from(mantelKeepers)
              .where(and(eq(mantelKeepers.userId, userId), isNull(mantelKeepers.leftAt))),
          ),
        ),
      // Their copies of each mantel's key go with them. The mantel stays.
      db.delete(mantelKeyWraps).where(eq(mantelKeyWraps.keeperId, userId)),
      db
        .update(mantelKeepers)
        .set({ leftAt: new Date() })
        .where(and(eq(mantelKeepers.userId, userId), isNull(mantelKeepers.leftAt))),
      db
        .update(mantelProposals)
        .set({ outcome: 'withdrawn', settledAt: new Date(), subjectEmail: null })
        .where(and(eq(mantelProposals.proposedBy, userId), isNull(mantelProposals.outcome))),
      db
        .update(mantelRecoveries)
        .set({ cancelledAt: new Date(), cancelledBy: userId })
        .where(
          and(
            eq(mantelRecoveries.claimantId, userId),
            isNull(mantelRecoveries.cancelledAt),
            isNull(mantelRecoveries.completedAt),
          ),
        ),
      // A child's mantel being handed over to them waits for another address.
      db
        .update(mantelHandovers)
        .set({
          childId: null,
          acceptedAt: null,
          invitedAt: null,
          wrapped: null,
          keyVersion: null,
          givenBy: null,
        })
        .where(and(eq(mantelHandovers.childId, userId), isNull(mantelHandovers.completedAt))),
      db.delete(keyWraps).where(eq(keyWraps.userId, userId)),
      db.delete(userKeys).where(eq(userKeys.userId, userId)),
    ],
  })
}

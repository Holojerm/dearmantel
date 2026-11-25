// Drafts: letters not yet sealed. The server stores ciphertext and the
// author's wrapped copy of the letter's key, and can open neither.

import { and, eq, isNull } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as tables from '@nuxthub/db/schema'

import { batchGuard, isGuardFailure, mantelKeyIs } from '#layers/keys/server/utils/batch-guard'
import { isKeeper } from '#layers/keys/server/utils/mantels'

import { hasReceived } from './mantel'
import { newsMantelOf } from './news'
import type { LettersDb } from './people'
import type { PhotoStore } from './photos'
import { sealedFor } from './seal-gate'

/**
 * Everyone else in an open correspondence the user belongs to. Null when they
 * are not in it or it is closed. A pair has one other member, a family
 * several, and a kept mantel is a member under its own id.
 */
export async function otherMembers(
  db: LettersDb,
  correspondenceId: string,
  userId: string,
): Promise<string[] | null> {
  const { correspondences, correspondenceMembers: members } = tables
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(
      and(
        eq(members.correspondenceId, correspondenceId),
        isNull(members.leftAt),
        isNull(correspondences.closedAt),
      ),
    )
  if (!rows.some((row) => row.userId === userId)) return null
  return rows.map((row) => row.userId).filter((id) => id !== userId)
}

/** The other person in a pair the user belongs to, or null. */
export async function correspondentOf(
  db: LettersDb,
  correspondenceId: string,
  userId: string,
): Promise<string | null> {
  return (await otherMembers(db, correspondenceId, userId))?.[0] ?? null
}

export type SaveDraftResult =
  | 'saved'
  | 'not-yours'
  | 'sealed'
  | 'closed'
  | 'not-received'
  /** A child's mantel's key changed after the browser wrapped the author's copy to it. */
  | 'key-changed'

/**
 * Creates the draft on its first save and replaces its ciphertext after. The
 * id is made in the browser, because the encryption is bound to it.
 */
export async function saveDraft(
  db: LettersDb,
  authorId: string,
  draft: {
    id: string
    correspondenceId: string
    ciphertext: string
    wrappedKey: string
    /** The letter this one answers. Set when the draft is first saved, never after. */
    inReplyTo?: string | null
    /**
     * When a child's mantel is the author: the mantel's public key the
     * author's copy was wrapped to. It must still be the mantel's key.
     */
    authorKey?: string
  },
  now: Date,
): Promise<SaveDraftResult> {
  const { letters, letterKeys } = tables
  const [existing] = await db.select().from(letters).where(eq(letters.id, draft.id)).limit(1)
  if (existing) {
    if (existing.authorId !== authorId) return 'not-yours'
    if (existing.sealedAt) return 'sealed'
    await db
      .update(letters)
      .set({ ciphertext: draft.ciphertext, updatedAt: now })
      .where(and(eq(letters.id, draft.id), isNull(letters.sealedAt)))
    return 'saved'
  }
  const news = await newsMantelOf(db, draft.correspondenceId)
  if (news) {
    // News is written by the child's keepers and answered by nobody.
    if (!(await isKeeper(db, authorId, news.mantelId)) || draft.inReplyTo) return 'closed'
  } else if (!(await otherMembers(db, draft.correspondenceId, authorId))?.length) {
    // Open, with someone to write to: a family of one has nobody yet.
    return 'closed'
  }
  if (draft.inReplyTo) {
    // A reply answers a letter that has arrived, in the same correspondence.
    const [answered] = await db
      .select({ correspondenceId: letters.correspondenceId })
      .from(letters)
      .where(eq(letters.id, draft.inReplyTo))
      .limit(1)
    if (
      answered?.correspondenceId !== draft.correspondenceId ||
      !(await hasReceived(db, authorId, draft.inReplyTo)) ||
      (await sealedFor(db, authorId, draft.inReplyTo, now))
    ) {
      return 'not-received'
    }
  }
  const statements: BatchItem<'sqlite'>[] = [
    // A re-key can land between the browser's wrap and this write.
    ...(draft.authorKey ? [batchGuard(db, mantelKeyIs(authorId, draft.authorKey))] : []),
    db.insert(letters).values({
      id: draft.id,
      correspondenceId: draft.correspondenceId,
      authorId,
      inReplyTo: draft.inReplyTo ?? null,
      ciphertext: draft.ciphertext,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(letterKeys).values({
      letterId: draft.id,
      userId: authorId,
      wrappedKey: draft.wrappedKey,
      createdAt: now,
    }),
  ]
  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  } catch (error) {
    if (isGuardFailure(error)) return 'key-changed'
    throw error
  }
  return 'saved'
}

/** A letter as its author may read it back: the ciphertext and their own key. */
export async function ownLetter(db: LettersDb, authorId: string, letterId: string) {
  const { letters, letterKeys } = tables
  const [row] = await db
    .select({
      id: letters.id,
      correspondenceId: letters.correspondenceId,
      ciphertext: letters.ciphertext,
      sealedAt: letters.sealedAt,
      inReplyTo: letters.inReplyTo,
      wrappedKey: letterKeys.wrappedKey,
    })
    .from(letters)
    .innerJoin(
      letterKeys,
      and(eq(letterKeys.letterId, letters.id), eq(letterKeys.userId, authorId)),
    )
    .where(and(eq(letters.id, letterId), eq(letters.authorId, authorId)))
    .limit(1)
  return row ?? null
}

/**
 * Throws away a draft, and its photo's file with it. A sealed letter is not a
 * draft: recall it first.
 */
export async function discardDraft(
  db: LettersDb,
  authorId: string,
  letterId: string,
  photos?: PhotoStore,
): Promise<boolean> {
  const { letters, letterKeys } = tables
  const mine = and(
    eq(letters.id, letterId),
    eq(letters.authorId, authorId),
    isNull(letters.sealedAt),
  )
  const [draft] = await db
    .select({ id: letters.id, photoKey: letters.photoKey })
    .from(letters)
    .where(mine)
    .limit(1)
  if (!draft) return false
  await db.batch([
    db.delete(letterKeys).where(eq(letterKeys.letterId, letterId)),
    db.delete(letters).where(mine),
  ])
  if (draft.photoKey) await photos?.remove([draft.photoKey])
  return true
}

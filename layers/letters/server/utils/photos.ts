// A letter's photo on the server: a sealed file in object storage, named on
// the letter's row. The server cannot open it. It follows the letter's rules:
// only the author may change it, only before sealing, and the recipient gets
// nothing until the letter has arrived.

import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { photoStorageKey } from '../../shared/utils/letter-photo'
import { hasReceived } from './mantel'
import type { LettersDb } from './people'
import { sealedFor } from './seal-gate'

/** Object storage, as much of it as a photo needs. */
export interface PhotoStore {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<ArrayBuffer | null>
  remove(keys: string[]): Promise<void>
}

export type PhotoChange = 'done' | 'not-yours' | 'sealed'

async function draftOf(db: LettersDb, authorId: string, letterId: string) {
  const { letters } = tables
  const [row] = await db
    .select({ sealedAt: letters.sealedAt, photoKey: letters.photoKey })
    .from(letters)
    .where(and(eq(letters.id, letterId), eq(letters.authorId, authorId)))
    .limit(1)
  return row ?? null
}

/** Stores a draft's photo, replacing the one it had. */
export async function attachPhoto(
  db: LettersDb,
  store: PhotoStore,
  authorId: string,
  photo: { letterId: string; photoId: string; bytes: Uint8Array },
  now: Date,
): Promise<PhotoChange> {
  const { letters } = tables
  const draft = await draftOf(db, authorId, photo.letterId)
  if (!draft) return 'not-yours'
  if (draft.sealedAt) return 'sealed'

  const key = photoStorageKey(photo.letterId, photo.photoId)
  await store.put(key, photo.bytes)
  const updated = await db
    .update(letters)
    .set({ photoKey: key, updatedAt: now })
    .where(and(eq(letters.id, photo.letterId), isNull(letters.sealedAt)))
    .returning({ id: letters.id })
  if (updated.length === 0) {
    // Sealed while the file was on its way up: the letter keeps what it had.
    await store.remove([key])
    return 'sealed'
  }
  if (draft.photoKey && draft.photoKey !== key) await store.remove([draft.photoKey])
  return 'done'
}

/** Takes the photo off a draft and deletes its file. */
export async function detachPhoto(
  db: LettersDb,
  store: PhotoStore,
  authorId: string,
  letterId: string,
  now: Date,
): Promise<PhotoChange> {
  const { letters } = tables
  const draft = await draftOf(db, authorId, letterId)
  if (!draft) return 'not-yours'
  if (draft.sealedAt) return 'sealed'
  if (!draft.photoKey) return 'done'
  const updated = await db
    .update(letters)
    .set({ photoKey: null, updatedAt: now })
    .where(and(eq(letters.id, letterId), isNull(letters.sealedAt)))
    .returning({ id: letters.id })
  if (updated.length === 0) return 'sealed'
  await store.remove([draft.photoKey])
  return 'done'
}

/**
 * The sealed file, for the letter's author or for someone it has arrived for.
 * Null for anyone else, for the recipient until delivery, and until its
 * opening day for a letter sealed until one.
 */
export async function readPhoto(
  db: LettersDb,
  store: PhotoStore,
  userId: string,
  letterId: string,
  now: Date,
): Promise<ArrayBuffer | null> {
  const { letters } = tables
  const [letter] = await db
    .select({ authorId: letters.authorId, photoKey: letters.photoKey })
    .from(letters)
    .where(eq(letters.id, letterId))
    .limit(1)
  if (!letter?.photoKey) return null
  if (letter.authorId !== userId) {
    if (!(await hasReceived(db, userId, letterId))) return null
    if (await sealedFor(db, userId, letterId, now)) return null
  }
  return store.get(letter.photoKey)
}

/** The sealed file of a letter, for its author only: a child's mantel reading back its own. */
export async function ownPhoto(
  db: LettersDb,
  store: PhotoStore,
  authorId: string,
  letterId: string,
): Promise<ArrayBuffer | null> {
  const { letters } = tables
  const [letter] = await db
    .select({ photoKey: letters.photoKey })
    .from(letters)
    .where(and(eq(letters.id, letterId), eq(letters.authorId, authorId)))
    .limit(1)
  return letter?.photoKey ? store.get(letter.photoKey) : null
}

/** Deletes the photo files of every draft a person has, before the drafts go. */
export async function removeDraftPhotos(
  db: LettersDb,
  store: PhotoStore,
  authorId: string,
): Promise<number> {
  const { letters } = tables
  const rows = await db
    .select({ photoKey: letters.photoKey })
    .from(letters)
    .where(
      and(eq(letters.authorId, authorId), isNull(letters.sealedAt), isNotNull(letters.photoKey)),
    )
  const keys = rows.map((row) => row.photoKey).filter((key): key is string => Boolean(key))
  if (keys.length > 0) await store.remove(keys)
  return keys.length
}

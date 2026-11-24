// A keeper's copy of a kept mantel: the letters that have been opened on it,
// and the letters a child's mantel wrote. Making a copy opens nothing, so a
// letter nobody has read yet is counted and left out, and a sealed one stays
// behind both of kept-mantel.ts's gates. A letter the mantel wrote is its
// own and goes in once, whether or not it came back.

import { and, eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { isKeeper } from '#layers/keys/server/utils/mantels'

import type { ArchiveEntry, ArchiveSealed, KeptArchive } from '../../shared/utils/archive'
import { arrivedOnMantel, isSealedOn, mantelToday } from './kept-mantel'
import { readSentForArchive, sentByMantel } from './kept-sent'
import type { LettersDb } from './people'

/** What a keeper may copy, oldest first. Null for anyone who does not keep the mantel. */
export async function listKeptArchive(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<KeptArchive | null> {
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const today = await mantelToday(db, mantelId, now)
  const rows = (await arrivedOnMantel(db, mantelId)).toReversed()
  const sealed = rows.filter((row) => isSealedOn(row.opensOn, today))
  const open = rows.filter((row) => !isSealedOn(row.opensOn, today))
  const received: ArchiveEntry[] = open
    .filter((row) => row.openedAt)
    .map((row) => ({
      id: row.letterId,
      direction: 'received',
      from: row.chosen ?? row.account ?? null,
      postmark: row.postmark,
      guest: row.origin === 'guest',
    }))
  const sent: ArchiveEntry[] = (await sentByMantel(db, mantelId)).map((row) => ({
    id: row.id,
    direction: 'sent',
    from: null,
    postmark: row.postmark,
    to: row.to,
  }))
  // By postmark, so a reply follows the letter it answers. Sort is stable,
  // so letters of one day keep the order they came in.
  const entries = [...received, ...sent].sort((a, b) =>
    (a.postmark ?? '').localeCompare(b.postmark ?? ''),
  )
  return {
    entries,
    unopened: open.filter((row) => !row.openedAt).length,
    sealed: sealed.length,
  }
}

/**
 * One letter's ciphertext and the mantel's copy of its key: an opened letter
 * on the mantel, or one the mantel wrote. Null for a letter that is sealed,
 * not yet opened, or not this mantel's; it never records an opening.
 */
export async function readKeptForArchive(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  letterId: string,
  now: Date,
): Promise<ArchiveSealed | null> {
  const { letterKeys } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const [row] = await arrivedOnMantel(db, mantelId, letterId)
  if (!row) return readSentForArchive(db, mantelId, letterId)
  if (!row.openedAt) return null
  if (isSealedOn(row.opensOn, await mantelToday(db, mantelId, now))) return null
  const [key] = await db
    .select({ wrappedKey: letterKeys.wrappedKey })
    .from(letterKeys)
    .where(and(eq(letterKeys.letterId, letterId), eq(letterKeys.userId, mantelId)))
    .limit(1)
  if (!key) return null
  return { ciphertext: row.ciphertext, wrappedKey: key.wrappedKey, hasPhoto: Boolean(row.photoKey) }
}

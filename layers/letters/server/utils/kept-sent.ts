// What a child's mantel wrote, as its keepers see it outside its outbox: who
// each letter went to, and the encrypted parts of one for a keeper's copy.
// A letter the mantel wrote is the mantel's own, so kept-mantel.ts's gates,
// which guard what it received, do not apply. Everything here is keyed by
// the mantel's id (the author, its `letter_keys` row, a return's delivery),
// which is what a handover moves to the child.

import { and, asc, count, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { ArchiveSealed } from '../../shared/utils/archive'
import type { LettersDb } from './people'

/**
 * Who the mantel writes to in each of these correspondences: the one member
 * who is not the mantel, whether or not they have since left. Absent when
 * their account is gone.
 */
export async function writersIn(
  db: LettersDb,
  mantelId: string,
  correspondenceIds: string[],
): Promise<Map<string, string>> {
  const { correspondenceMembers: members, people, users } = tables
  if (correspondenceIds.length === 0) return new Map()
  const rows = await db
    .select({
      correspondenceId: members.correspondenceId,
      chosen: people.displayName,
      account: users.name,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .where(
      and(
        inArray(members.correspondenceId, [...new Set(correspondenceIds)]),
        ne(members.userId, mantelId),
      ),
    )
  return new Map(rows.map((row) => [row.correspondenceId, row.chosen ?? row.account]))
}

/** How many letters the mantel has sealed. */
export async function countSent(db: LettersDb, mantelId: string): Promise<number> {
  const { letters } = tables
  const [row] = await db
    .select({ n: count() })
    .from(letters)
    .where(and(eq(letters.authorId, mantelId), isNotNull(letters.sealedAt)))
  return row?.n ?? 0
}

/** Every letter the mantel has sealed, oldest first, with who it went to. */
export async function sentByMantel(db: LettersDb, mantelId: string) {
  const { letters } = tables
  const rows = await db
    .select({
      id: letters.id,
      correspondenceId: letters.correspondenceId,
      postmark: letters.postmarkDate,
    })
    .from(letters)
    .where(and(eq(letters.authorId, mantelId), isNotNull(letters.sealedAt)))
    .orderBy(asc(letters.sealedAt))
  const names = await writersIn(
    db,
    mantelId,
    rows.map((row) => row.correspondenceId),
  )
  return rows.map((row) => ({ ...row, to: names.get(row.correspondenceId) ?? null }))
}

/**
 * One sealed letter the mantel wrote: its ciphertext and the mantel's copy of
 * its key. The caller has checked that they keep the mantel.
 */
export async function readSentForArchive(
  db: LettersDb,
  mantelId: string,
  letterId: string,
): Promise<ArchiveSealed | null> {
  const { letters, letterKeys } = tables
  const [row] = await db
    .select({
      ciphertext: letters.ciphertext,
      photoKey: letters.photoKey,
      wrappedKey: letterKeys.wrappedKey,
    })
    .from(letters)
    .innerJoin(
      letterKeys,
      and(eq(letterKeys.letterId, letters.id), eq(letterKeys.userId, mantelId)),
    )
    .where(
      and(eq(letters.id, letterId), eq(letters.authorId, mantelId), isNotNull(letters.sealedAt)),
    )
    .limit(1)
  if (!row) return null
  return { ciphertext: row.ciphertext, wrappedKey: row.wrappedKey, hasPhoto: Boolean(row.photoKey) }
}

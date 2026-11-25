// The mantel: what has arrived for a person. Nothing appears here before its
// release, and nothing here is ever shown to anyone else: `openedAt` and
// `deliveredAt` are read only on behalf of the recipient.

import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { MantelItem, OpenedLetter } from '../../shared/utils/mantel'
import type { LettersDb } from './people'
import { isSealedOn } from './kept-mantel'
import { readerToday } from './seal-gate'

/** What each person, or each child's mantel that writes, is called. */
export async function displayNames(db: LettersDb, ids: string[]): Promise<Map<string, string>> {
  const { users, people, mantels } = tables
  const names = new Map<string, string>()
  for (const id of new Set(ids)) {
    const [row] = await db
      .select({ chosen: people.displayName, account: users.name })
      .from(users)
      .leftJoin(people, eq(people.userId, users.id))
      .where(eq(users.id, id))
      .limit(1)
    if (row) {
      names.set(id, row.chosen ?? row.account)
      continue
    }
    const [mantel] = await db
      .select({ name: mantels.name })
      .from(mantels)
      .where(eq(mantels.id, id))
      .limit(1)
    if (mantel) names.set(id, mantel.name)
  }
  return names
}

/** The other member of a correspondence, whether or not they have since left. */
async function otherMember(db: LettersDb, correspondenceId: string, userId: string) {
  const { correspondenceMembers: members } = tables
  const [row] = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.correspondenceId, correspondenceId), ne(members.userId, userId)))
    .limit(1)
  return row?.userId ?? null
}

async function delivered(db: LettersDb, userId: string, letterId?: string) {
  const { deliveries, letters, mantelNews, mantels } = tables
  return db
    .select({
      deliveryId: deliveries.id,
      letterId: letters.id,
      correspondenceId: letters.correspondenceId,
      kind: deliveries.kind,
      authorId: letters.authorId,
      postmark: letters.postmarkDate,
      arrivedOn: deliveries.mailDate,
      openedAt: deliveries.openedAt,
      ciphertext: letters.ciphertext,
      inReplyTo: letters.inReplyTo,
      opensOn: letters.opensOn,
      // The child's name when the letter is news of them.
      news: mantels.name,
    })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .leftJoin(mantelNews, eq(mantelNews.correspondenceId, letters.correspondenceId))
    .leftJoin(mantels, eq(mantels.id, mantelNews.mantelId))
    .where(
      and(
        eq(deliveries.recipientId, userId),
        eq(deliveries.state, 'delivered'),
        letterId ? eq(deliveries.letterId, letterId) : undefined,
      ),
    )
    .orderBy(desc(deliveries.deliveredAt))
}

export async function listMantel(db: LettersDb, userId: string, now: Date): Promise<MantelItem[]> {
  const rows = await delivered(db, userId)
  const today = await readerToday(db, userId, now)
  const others = new Map<string, string | null>()
  for (const row of rows) {
    // Returned news has no one name to go under.
    if (row.kind === 'return' && !row.news && !others.has(row.correspondenceId)) {
      others.set(row.correspondenceId, await otherMember(db, row.correspondenceId, userId))
    }
  }
  const who = (row: (typeof rows)[number]) =>
    row.kind === 'return' ? (others.get(row.correspondenceId) ?? null) : row.authorId
  const names = await displayNames(
    db,
    rows.map(who).filter((id): id is string => Boolean(id)),
  )
  return rows.map((row) => ({
    letterId: row.letterId,
    correspondenceId: row.correspondenceId,
    kind: row.kind === 'return' ? 'return' : 'letter',
    name: names.get(who(row) ?? '') ?? null,
    news: row.news,
    postmark: row.postmark,
    arrivedOn: row.arrivedOn,
    opened: Boolean(row.openedAt),
    sealedUntil: isSealedOn(row.opensOn, today) ? row.opensOn : null,
  }))
}

/**
 * Opens a letter that has arrived for this person: its ciphertext and their
 * own copy of its key. The first opening is recorded, for their mantel only.
 */
export async function openLetter(
  db: LettersDb,
  userId: string,
  letterId: string,
  now: Date,
): Promise<OpenedLetter | null> {
  const { deliveries, letterKeys, correspondences } = tables
  const [row] = await delivered(db, userId, letterId)
  if (!row) return null
  // Sealed until a day that has not come: nothing of it yet, and no opening.
  if (isSealedOn(row.opensOn, await readerToday(db, userId, now))) return null
  const [key] = await db
    .select({ wrappedKey: letterKeys.wrappedKey })
    .from(letterKeys)
    .where(and(eq(letterKeys.letterId, letterId), eq(letterKeys.userId, userId)))
    .limit(1)
  if (!key) return null

  if (!row.openedAt) {
    await db
      .update(deliveries)
      .set({ openedAt: now })
      .where(and(eq(deliveries.id, row.deliveryId), isNull(deliveries.openedAt)))
  }
  const other = row.news ? null : await otherMember(db, row.correspondenceId, userId)
  const subject = row.kind === 'return' ? other : row.authorId
  const names = await displayNames(db, subject ? [subject] : [])
  const [correspondence] = await db
    .select({ closedAt: correspondences.closedAt })
    .from(correspondences)
    .where(eq(correspondences.id, row.correspondenceId))
    .limit(1)
  return {
    letterId: row.letterId,
    correspondenceId: row.correspondenceId,
    kind: row.kind === 'return' ? 'return' : 'letter',
    name: names.get(subject ?? '') ?? null,
    news: row.news,
    postmark: row.postmark,
    ciphertext: row.ciphertext,
    wrappedKey: key.wrappedKey,
    inReplyTo: row.inReplyTo,
    // News is read-only: nobody replies to it.
    canReply:
      row.kind === 'letter' && !row.news && Boolean(correspondence) && !correspondence?.closedAt,
  }
}

/** Whether a letter has arrived for this person, so they may reply to it. */
export async function hasReceived(db: LettersDb, userId: string, letterId: string) {
  const { deliveries } = tables
  const [row] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.letterId, letterId),
        eq(deliveries.recipientId, userId),
        eq(deliveries.kind, 'letter'),
        eq(deliveries.state, 'delivered'),
      ),
    )
    .limit(1)
  return Boolean(row)
}

// The letters section of a person's data export: everything the server holds
// about their correspondence. Letter text is exported as it is stored, which
// is encrypted. It follows the same rules as the screens: nothing that has not
// arrived yet, and nothing about what became of a letter they sent.

import { and, desc, eq, inArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { LettersDb } from './people'
import { isSealedOn } from './kept-mantel'
import { readerToday } from './seal-gate'

export interface ExportedLetter {
  id: string
  correspondenceId: string
  inReplyTo: string | null
  hasPhoto: boolean
  /** Encrypted. It opens only with the key below and this account's private key. */
  ciphertext: string
  /** This account's copy of the letter's key, itself encrypted. */
  wrappedKey: string | null
}

export interface AccountExportLetters {
  note: string
  /** The name correspondents see. */
  name: string | null
  correspondences: {
    id: string
    /** The other person's chosen name. Null when their account is gone. */
    with: string | null
    since: string
    closedAt: string | null
  }[]
  invitations: {
    email: string | null
    sentAt: string
    expiresAt: string
    acceptedAt: string | null
  }[]
  /** Drafts and sealed letters. Nothing here says whether one was delivered or read. */
  written: (ExportedLetter & {
    sealedAt: string | null
    postmark: string | null
  })[]
  /** Only what has arrived. */
  received: (ExportedLetter & {
    kind: 'letter' | 'return'
    postmark: string | null
    arrivedOn: string | null
    openedAt: string | null
  })[]
}

const NOTE =
  'Letters are end-to-end encrypted, so this file holds them as we store them: encrypted. ' +
  'They can be read in the app on a device that has your key. Photos are not included.'

const iso = (date: Date | null) => (date ? date.toISOString() : null)

export async function exportLetters(
  db: LettersDb,
  userId: string,
  now: Date,
): Promise<AccountExportLetters> {
  const {
    people,
    invites,
    correspondences,
    correspondenceMembers: members,
    letters,
    letterKeys,
    deliveries,
  } = tables

  const [person] = await db
    .select({ name: people.displayName })
    .from(people)
    .where(eq(people.userId, userId))
    .limit(1)

  const mine = await db
    .select({
      id: correspondences.id,
      since: members.createdAt,
      closedAt: correspondences.closedAt,
    })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(eq(members.userId, userId))
  const others = mine.length
    ? await db
        .select({
          correspondenceId: members.correspondenceId,
          userId: members.userId,
          name: people.displayName,
        })
        .from(members)
        .leftJoin(people, eq(people.userId, members.userId))
        .where(
          inArray(
            members.correspondenceId,
            mine.map((row) => row.id),
          ),
        )
    : []
  const nameOf = new Map(
    others.filter((row) => row.userId !== userId).map((row) => [row.correspondenceId, row.name]),
  )

  const sent = await db
    .select()
    .from(invites)
    .where(eq(invites.inviterId, userId))
    .orderBy(desc(invites.createdAt))

  const written = await db
    .select({
      id: letters.id,
      correspondenceId: letters.correspondenceId,
      inReplyTo: letters.inReplyTo,
      photoKey: letters.photoKey,
      ciphertext: letters.ciphertext,
      wrappedKey: letterKeys.wrappedKey,
      sealedAt: letters.sealedAt,
      postmark: letters.postmarkDate,
    })
    .from(letters)
    .leftJoin(letterKeys, and(eq(letterKeys.letterId, letters.id), eq(letterKeys.userId, userId)))
    .where(eq(letters.authorId, userId))
    .orderBy(desc(letters.createdAt))

  // `delivered` only: a letter still on its way is not on the mantel, and is
  // not in the export either.
  const received = await db
    .select({
      id: letters.id,
      correspondenceId: letters.correspondenceId,
      inReplyTo: letters.inReplyTo,
      photoKey: letters.photoKey,
      ciphertext: letters.ciphertext,
      wrappedKey: letterKeys.wrappedKey,
      kind: deliveries.kind,
      postmark: letters.postmarkDate,
      arrivedOn: deliveries.mailDate,
      openedAt: deliveries.openedAt,
      opensOn: letters.opensOn,
    })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .leftJoin(letterKeys, and(eq(letterKeys.letterId, letters.id), eq(letterKeys.userId, userId)))
    .where(and(eq(deliveries.recipientId, userId), eq(deliveries.state, 'delivered')))
    .orderBy(desc(deliveries.deliveredAt))

  const today = await readerToday(db, userId, now)
  return {
    note: NOTE,
    name: person?.name ?? null,
    correspondences: mine.map((row) => ({
      id: row.id,
      with: nameOf.get(row.id) ?? null,
      since: row.since.toISOString(),
      closedAt: iso(row.closedAt),
    })),
    invitations: sent.map((row) => ({
      email: row.inviteeEmail,
      sentAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: iso(row.acceptedAt),
    })),
    written: written.map(({ photoKey, sealedAt, ...row }) => ({
      ...row,
      hasPhoto: Boolean(photoKey),
      sealedAt: iso(sealedAt),
    })),
    received: received.map(({ photoKey, openedAt, kind, opensOn, ...row }) => ({
      ...row,
      // Sealed until a day that has not come: its key is withheld here too.
      wrappedKey: isSealedOn(opensOn, today) ? null : row.wrappedKey,
      kind: kind === 'return' ? 'return' : 'letter',
      hasPhoto: Boolean(photoKey),
      openedAt: iso(openedAt),
    })),
  }
}

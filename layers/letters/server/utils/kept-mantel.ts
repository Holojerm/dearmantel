// A kept mantel's letters, for its keepers. Two gates, both here: nothing
// shows before its delivery, and a letter sealed until a day gives up its
// text, photo and key to nobody before that day on the mantel's calendar,
// keepers included. The seal is this code withholding the letter plus a key
// the server never has. One other place hands out a sealed letter's wrapped
// key and nothing else of it: a re-key (kept-rekey.ts), which must wrap every
// key again. A letter a child's mantel wrote that came back is listed and
// opened here too, as a return: it is the mantel's own, and never sealed.

import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { isKeeper, keepersOf } from '#layers/keys/server/utils/mantels'
import { changeMailSettings, moveToCity } from '#layers/post/server/utils/profile-settings'
import { localParts } from '#layers/post/shared/utils/calendar'

import type { KeptItem, KeptLetter } from '../../shared/utils/kept'
import { returnInTransitTo } from './closing'
import { writersIn } from './kept-sent'
import type { LettersDb } from './people'
import type { PhotoStore } from './photos'

/** Today's date where the mantel's post arrives. */
export async function mantelToday(db: LettersDb, mantelId: string, now: Date): Promise<string> {
  const { postalProfiles } = tables
  const [profile] = await db
    .select({ timeZone: postalProfiles.timeZone })
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, mantelId))
    .limit(1)
  return localParts(now, profile?.timeZone ?? 'UTC').date
}

/** Sealed while its day has not come. The day itself opens it. */
export const isSealedOn = (opensOn: string | null, today: string) =>
  Boolean(opensOn) && today < opensOn!

/**
 * Every letter delivered to a kept mantel, newest first, or one of them.
 * With `withReturns`, also the mantel's own letters that came back.
 */
export async function arrivedOnMantel(
  db: LettersDb,
  mantelId: string,
  letterId?: string,
  withReturns = false,
) {
  const { deliveries, letters, people, users } = tables
  return db
    .select({
      deliveryId: deliveries.id,
      kind: deliveries.kind,
      letterId: letters.id,
      correspondenceId: letters.correspondenceId,
      authorId: letters.authorId,
      postmark: letters.postmarkDate,
      arrivedOn: deliveries.mailDate,
      openedAt: deliveries.openedAt,
      opensOn: letters.opensOn,
      origin: letters.origin,
      ciphertext: letters.ciphertext,
      photoKey: letters.photoKey,
      chosen: people.displayName,
      account: users.name,
    })
    .from(deliveries)
    .innerJoin(letters, eq(letters.id, deliveries.letterId))
    .leftJoin(users, eq(users.id, letters.authorId))
    .leftJoin(people, eq(people.userId, letters.authorId))
    .where(
      and(
        eq(deliveries.recipientId, mantelId),
        withReturns
          ? inArray(deliveries.kind, ['letter', 'return'])
          : eq(deliveries.kind, 'letter'),
        eq(deliveries.state, 'delivered'),
        letterId ? eq(deliveries.letterId, letterId) : undefined,
      ),
    )
    .orderBy(desc(deliveries.deliveredAt))
}

type Arrived = Awaited<ReturnType<typeof arrivedOnMantel>>[number]

/** Who wrote each letter, or for a return who it was for. */
async function namesFor(db: LettersDb, mantelId: string, rows: Arrived[]) {
  const returns = rows.filter((row) => row.kind === 'return')
  const writers = await writersIn(
    db,
    mantelId,
    returns.map((row) => row.correspondenceId),
  )
  return (row: Arrived) =>
    row.kind === 'return'
      ? (writers.get(row.correspondenceId) ?? null)
      : (row.chosen ?? row.account ?? null)
}

/** What has arrived on a kept mantel. Null for anyone who does not keep it. */
export async function listKeptMantel(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  now: Date,
): Promise<KeptItem[] | null> {
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const today = await mantelToday(db, mantelId, now)
  const rows = await arrivedOnMantel(db, mantelId, undefined, true)
  const nameOf = await namesFor(db, mantelId, rows)
  return rows.map((row) => ({
    letterId: row.letterId,
    kind: row.kind === 'return' ? 'return' : 'letter',
    name: nameOf(row),
    postmark: row.postmark,
    arrivedOn: row.arrivedOn,
    opened: Boolean(row.openedAt),
    opensOn: row.opensOn,
    sealed: isSealedOn(row.opensOn, today),
    guest: row.origin === 'guest',
  }))
}

/**
 * Opens a letter on a kept mantel for one of its keepers: its ciphertext and
 * the mantel's copy of its key. A sealed letter returns only its opening day.
 */
export async function openKeptLetter(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  letterId: string,
  now: Date,
): Promise<KeptLetter | null> {
  const { deliveries, letterKeys } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const [row] = await arrivedOnMantel(db, mantelId, letterId, true)
  if (!row) return null
  if (row.opensOn && isSealedOn(row.opensOn, await mantelToday(db, mantelId, now))) {
    return { sealed: true, letterId, postmark: row.postmark, opensOn: row.opensOn }
  }
  const [key] = await db
    .select({ wrappedKey: letterKeys.wrappedKey })
    .from(letterKeys)
    .where(and(eq(letterKeys.letterId, letterId), eq(letterKeys.userId, mantelId)))
    .limit(1)
  if (!key) return null
  if (!row.openedAt) {
    await db
      .update(deliveries)
      .set({ openedAt: now })
      .where(and(eq(deliveries.id, row.deliveryId), isNull(deliveries.openedAt)))
  }
  const returned = row.kind === 'return'
  return {
    answerIn: returned ? null : await answerableFrom(db, mantelId, row),
    sealed: false,
    letterId,
    kind: returned ? 'return' : 'letter',
    name: (await namesFor(db, mantelId, [row]))(row),
    postmark: row.postmark,
    ciphertext: row.ciphertext,
    wrappedKey: key.wrappedKey,
    hasPhoto: Boolean(row.photoKey),
    guest: row.origin === 'guest',
  }
}

/**
 * Where a child's mantel can write back to a letter that arrived on it: the
 * writer's correspondence, while it is open. A guest letter has no one to
 * answer, and only a child's mantel writes.
 */
async function answerableFrom(
  db: LettersDb,
  mantelId: string,
  row: { correspondenceId: string; authorId: string | null; origin: string },
): Promise<string | null> {
  const { correspondences, mantels } = tables
  if (row.origin !== 'member' || !row.authorId) return null
  const [open] = await db
    .select({ id: correspondences.id })
    .from(correspondences)
    .innerJoin(mantels, eq(mantels.id, correspondences.mantelId))
    .where(
      and(
        eq(correspondences.id, row.correspondenceId),
        eq(correspondences.mantelId, mantelId),
        eq(mantels.kind, 'child'),
        isNull(correspondences.closedAt),
        isNull(mantels.closedAt),
      ),
    )
    .limit(1)
  return open?.id ?? null
}

/** The sealed photo file of a letter on a kept mantel, under the same two gates. */
export async function readKeptPhoto(
  db: LettersDb,
  store: PhotoStore,
  keeperId: string,
  mantelId: string,
  letterId: string,
  now: Date,
): Promise<ArrayBuffer | null> {
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const [row] = await arrivedOnMantel(db, mantelId, letterId)
  if (!row?.photoKey) return null
  if (isSealedOn(row.opensOn, await mantelToday(db, mantelId, now))) return null
  return store.get(row.photoKey)
}

/**
 * Who writes to a kept mantel, and the invitations its keepers have waiting.
 * Null for anyone who does not keep it.
 */
export async function listWriters(db: LettersDb, keeperId: string, mantelId: string, now: Date) {
  const { correspondences, correspondenceMembers: members, invites, people, users } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return null
  const writers = await db
    .select({ userId: members.userId, chosen: people.displayName, account: users.name })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(people, eq(people.userId, members.userId))
    .where(
      and(
        eq(correspondences.mantelId, mantelId),
        isNull(correspondences.closedAt),
        isNull(members.leftAt),
        ne(members.userId, mantelId),
      ),
    )
  const keeperIds = (await keepersOf(db, mantelId)).map((keeper) => keeper.userId)
  const waiting = await db
    .select({ id: invites.id, email: invites.inviteeEmail, expiresAt: invites.expiresAt })
    .from(invites)
    .where(
      and(eq(invites.mantelId, mantelId), isNull(invites.acceptedAt), gt(invites.expiresAt, now)),
    )
  return {
    writers: writers.map((row) => ({
      userId: row.userId,
      name: row.chosen ?? row.account,
      keeper: keeperIds.includes(row.userId),
    })),
    invited: waiting
      .filter((row) => row.email)
      .map((row) => ({ id: row.id, email: row.email!, expiresAt: row.expiresAt.toISOString() })),
  }
}

export type StopWriterResult = 'stopped' | 'not-keeper' | 'not-a-writer' | 'is-keeper'

/**
 * A keeper stops someone writing to the mantel. Their letters still on the
 * way go back to them; what has already arrived stays, because it belongs to
 * whoever the mantel is for. A keeper is not stopped this way: who keeps a
 * mantel changes only by its keepers' agreement.
 */
export async function stopWriter(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  writerId: string,
  now: Date,
): Promise<StopWriterResult> {
  const { correspondences, correspondenceMembers: members } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return 'not-keeper'
  if (await isKeeper(db, writerId, mantelId)) return 'is-keeper'
  const [row] = await db
    .select({ id: correspondences.id })
    .from(members)
    .innerJoin(correspondences, eq(correspondences.id, members.correspondenceId))
    .where(
      and(
        eq(correspondences.mantelId, mantelId),
        isNull(correspondences.closedAt),
        eq(members.userId, writerId),
        isNull(members.leftAt),
      ),
    )
    .limit(1)
  if (!row) return 'not-a-writer'
  const closed = await db
    .update(correspondences)
    .set({ closedAt: now, closedBy: keeperId, updatedAt: now })
    .where(and(eq(correspondences.id, row.id), isNull(correspondences.closedAt)))
    .returning({ id: correspondences.id })
  if (closed.length === 0) return 'not-a-writer'
  // What they wrote that is still on its way goes back. What a child's mantel
  // wrote to them still arrives, as any posted letter does.
  await returnInTransitTo(db, mantelId, now, row.id)
  return 'stopped'
}

/** Any keeper may take back an invitation to write that nobody has accepted. */
export async function withdrawWriterInvite(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  inviteId: string,
): Promise<boolean> {
  const { invites } = tables
  if (!(await isKeeper(db, keeperId, mantelId))) return false
  const removed = await db
    .delete(invites)
    .where(
      and(eq(invites.id, inviteId), eq(invites.mantelId, mantelId), isNull(invites.acceptedAt)),
    )
    .returning({ id: invites.id })
  return removed.length > 0
}

export type MantelPostChange = { cityId: number } | { mailDays: number; deliveryHour: number }
export type ChangeMantelPostResult = 'changed' | 'not-keeper' | 'no-post' | 'unknown-city'

/**
 * Any keeper may change where and when a mantel's post arrives, by the rules
 * a person's own post follows: a new city at once, new days and hour from
 * tomorrow. Letters already on their way keep the day they were given.
 */
export async function changeMantelPost(
  db: LettersDb,
  keeperId: string,
  mantelId: string,
  change: MantelPostChange,
  now: Date,
): Promise<ChangeMantelPostResult> {
  if (!(await isKeeper(db, keeperId, mantelId))) return 'not-keeper'
  if ('cityId' in change) {
    const moved = await moveToCity(db, mantelId, change.cityId, now)
    return moved === 'moved' ? 'changed' : moved === 'no-profile' ? 'no-post' : moved
  }
  const changed = await changeMailSettings(db, mantelId, change, now)
  return changed === 'changed' ? 'changed' : 'no-post'
}

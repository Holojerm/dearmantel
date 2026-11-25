// The seal on a person's own mantel. Only kept mantels took sealed letters
// until a child's mantel was handed over: its letters keep their opening day
// on the child's own mantel. Before that day, on the reader's calendar, the
// server serves the reader no text, photo or key of the letter, and nobody
// answers it. The same rule as kept-mantel.ts, for any reader.

import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { isSealedOn, mantelToday } from './kept-mantel'
import type { LettersDb } from './people'

/** Today on this reader's calendar, a person's or a kept mantel's. */
export const readerToday = mantelToday

/** A letter sealed until a day that has not come for this reader. */
export async function sealedFor(db: LettersDb, readerId: string, letterId: string, now: Date) {
  const { letters } = tables
  const [row] = await db
    .select({ opensOn: letters.opensOn })
    .from(letters)
    .where(eq(letters.id, letterId))
    .limit(1)
  return Boolean(row?.opensOn) && isSealedOn(row!.opensOn, await readerToday(db, readerId, now))
}

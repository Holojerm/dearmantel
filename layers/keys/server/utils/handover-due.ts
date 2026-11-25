// The handover day, as the daily task sees it (../tasks/mantel-handover.ts):
// child's mantels whose day has come, on each mantel's own calendar, with an
// address to invite or keepers to tell, and the record that each was done.

import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { handoverIsDue, mantelDay } from './handover-date'
import type { KeysDb } from './keys'
import { keepersOf } from './mantels'

/**
 * Child's mantels whose handover day has come: the address to invite, if
 * one is named and not yet invited, and whether the keepers are still to be
 * told the day has come. For the daily task.
 */
export async function dueHandovers(db: KeysDb, now: Date) {
  const { mantels, mantelHandovers } = tables
  // Every time zone's today is within a day of UTC's.
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const rows = await db
    .select({
      mantelId: mantels.id,
      name: mantels.name,
      handoverOn: mantels.handoverOn,
      email: mantelHandovers.email,
      invitedAt: mantelHandovers.invitedAt,
      keepersToldAt: mantelHandovers.keepersToldAt,
    })
    .from(mantels)
    .leftJoin(mantelHandovers, eq(mantelHandovers.mantelId, mantels.id))
    .where(
      and(
        eq(mantels.kind, 'child'),
        isNull(mantels.handedOverAt),
        isNotNull(mantels.handoverOn),
        sql`${mantels.handoverOn} <= ${soon}`,
        or(
          isNull(mantelHandovers.mantelId),
          isNull(mantelHandovers.keepersToldAt),
          and(isNotNull(mantelHandovers.email), isNull(mantelHandovers.invitedAt)),
        ),
      ),
    )
  const due = []
  for (const row of rows) {
    if (!handoverIsDue(row.handoverOn, await mantelDay(db, row.mantelId, now))) continue
    due.push({
      mantelId: row.mantelId,
      name: row.name,
      invite: row.email && !row.invitedAt ? row.email : null,
      tellKeepers: !row.keepersToldAt,
      keeperIds: (await keepersOf(db, row.mantelId)).map((keeper) => keeper.userId),
    })
  }
  return due
}

/** Records that the invitation went to this address, or that the keepers were told. */
export async function markHandoverSent(
  db: KeysDb,
  mantelId: string,
  sent: { invited?: string; keepersTold?: boolean },
  now: Date,
): Promise<void> {
  const { mantelHandovers } = tables
  if (sent.keepersTold) {
    await db
      .insert(mantelHandovers)
      .values({ mantelId, keepersToldAt: now, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: mantelHandovers.mantelId,
        set: { keepersToldAt: now, updatedAt: now },
      })
  }
  if (sent.invited) {
    // Only if the address is still the one invited: a keeper may have changed it since.
    await db
      .update(mantelHandovers)
      .set({ invitedAt: now, updatedAt: now })
      .where(and(eq(mantelHandovers.mantelId, mantelId), eq(mantelHandovers.email, sent.invited)))
  }
}

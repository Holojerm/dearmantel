// A check that runs inside a batch. A handler reads, decides, then writes: if
// what it read can change in between, the write has to carry the condition
// with it. D1 runs a batch as one transaction and rolls all of it back when a
// statement fails, so a guard is a statement that fails unless the condition
// still holds: it tries to insert into `batch_guards`, whose check refuses
// every row.

import { sql, type SQL } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { KeysDb } from './keys'

/**
 * A statement for a batch: the batch is rolled back unless `holds` is true
 * when it runs. Built with the query builder, not `db.run`: Drizzle's D1
 * batch cannot bind the values of a raw statement.
 */
export function batchGuard(db: KeysDb, holds: SQL) {
  return db.insert(tables.batchGuards).select(
    db
      .select({ failed: sql<string>`'failed'`.as('failed') })
      .from(sql`(SELECT 1) AS one`)
      .where(sql`NOT (${holds})`),
  )
}

/** Whether a rejected batch was stopped by a guard rather than by a fault. */
export function isGuardFailure(error: unknown): boolean {
  for (let cause: unknown = error, depth = 0; cause && depth < 5; depth += 1) {
    if (/batch_guards/.test(String((cause as { message?: unknown }).message ?? cause))) return true
    cause = (cause as { cause?: unknown }).cause
  }
  return false
}

/**
 * True while the mantel's key is still the one a browser wrapped to, and the
 * mantel is open: once handed over, nothing more is filed under its id.
 */
export const mantelKeyIs = (mantelId: string, publicKey: string) =>
  sql`EXISTS (SELECT 1 FROM mantels
    WHERE id = ${mantelId} AND public_key = ${publicKey} AND closed_at IS NULL)`

/** True while the mantel has not been re-keyed since a browser read this version. */
export const mantelKeyVersionIs = (mantelId: string, keyVersion: number) =>
  sql`EXISTS (SELECT 1 FROM mantels WHERE id = ${mantelId} AND key_version = ${keyVersion})`

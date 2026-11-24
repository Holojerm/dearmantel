// A mantel's only keeper deleting their account. The mantel belongs to the
// child or the couple it is for, so it stays, with its letters. With nobody
// keeping it, only its printed recovery code opens it again (recovery.ts:
// whoever has the code becomes its keeper after the wait). So the last
// keeper may go only once they have shown they hold that code: otherwise
// the letters would be lost for good.
//
// The proof is the one recovery already uses: a value the code derives in
// the browser, whose hash the mantel stores. The server learns neither the
// code nor the key.

import { and, count, eq, isNull, ne } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { sha256Hex } from '#server/utils/hash'
import type { DeletionBlock } from '#server/utils/extensions'

import type { KeysDb } from './keys'

declare module '#server/utils/extensions' {
  interface DeletionContext {
    /** For each mantel the person alone keeps, the proof its recovery code derives. */
    mantelRecoveryProofs?: Record<string, string>
  }
}

export interface SoleKeptMantel {
  id: string
  name: string
  kind: string
  recoveryProofHash: string | null
}

/** Open mantels this person is the only keeper of. */
export async function soleKeeperOf(db: KeysDb, userId: string): Promise<SoleKeptMantel[]> {
  const { mantels, mantelKeepers } = tables
  const mine = await db
    .select({
      id: mantels.id,
      name: mantels.name,
      kind: mantels.kind,
      recoveryProofHash: mantels.recoveryProofHash,
    })
    .from(mantelKeepers)
    .innerJoin(mantels, eq(mantels.id, mantelKeepers.mantelId))
    .where(
      and(eq(mantelKeepers.userId, userId), isNull(mantelKeepers.leftAt), isNull(mantels.closedAt)),
    )
  const alone: SoleKeptMantel[] = []
  for (const mantel of mine) {
    const [others] = await db
      .select({ total: count() })
      .from(mantelKeepers)
      .where(
        and(
          eq(mantelKeepers.mantelId, mantel.id),
          ne(mantelKeepers.userId, userId),
          isNull(mantelKeepers.leftAt),
        ),
      )
    if ((others?.total ?? 0) === 0) alone.push(mantel)
  }
  return alone
}

async function proves(proof: string | undefined, hash: string | null): Promise<boolean> {
  return Boolean(proof && hash && (await sha256Hex(proof)) === hash)
}

/**
 * The deletion guard. Refuses while the person alone keeps a mantel and has
 * not proved they hold its recovery code. A wrong proof is told apart from
 * none, so the page can say the code did not match.
 */
export async function soleKeeperBlock(
  db: KeysDb,
  userId: string,
  proofs: Record<string, string> | undefined,
): Promise<DeletionBlock | null> {
  const alone = await soleKeeperOf(db, userId)
  const unproved: SoleKeptMantel[] = []
  for (const mantel of alone) {
    if (!(await proves(proofs?.[mantel.id], mantel.recoveryProofHash))) unproved.push(mantel)
  }
  if (unproved.length === 0) return null
  const names = unproved.map((mantel) => mantel.name)
  const data = {
    mantels: names,
    kept: unproved.map(({ id, name, kind }) => ({ id, name, kind })),
  }
  if (proofs && Object.keys(proofs).length > 0) {
    return {
      code: 'mantel_recovery_code_mismatch',
      message: `That recovery code does not match ${names.join(', ')}. Nothing was deleted.`,
      data,
    }
  }
  return {
    code: 'sole_mantel_keeper',
    message: `You are the only keeper of ${names.join(', ')}. Add another keeper, or confirm its recovery code, before deleting your account, so its letters are not lost.`,
    data,
  }
}

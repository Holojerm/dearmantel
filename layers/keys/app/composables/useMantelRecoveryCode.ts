// A new recovery code for a kept mantel, made in a keeper's browser from the
// key it already holds. The key does not change: only the copy locked under
// the code is replaced (server/utils/recovery-code.ts).

import {
  formatRecoveryCode,
  parseRecoveryCode,
  RECOVERY_CODE_BYTES,
} from '../../shared/utils/key-format'
import { importPrivateKey, publicKeyOf } from '../utils/key-crypto'
import { recoveryProof, recoveryProofHash, wrapMantelKeyUnderCode } from '../utils/mantel-crypto'
import { readPendingCode, writePendingCode } from '../utils/pending-recovery-code'
import type { KeptMantel } from './useMantelKeys'

export type NewCodeOutcome =
  | { status: 'made'; code: string }
  | { status: 'cannot-open' | 'rekey-due' | 'changed' | 'failed' }

interface CurrentMantel extends KeptMantel {
  keyVersion: number
  publicKey: string
}

async function hashOf(code: string): Promise<string | null> {
  const bytes = parseRecoveryCode(code)
  return bytes ? recoveryProofHash(await recoveryProof(bytes)) : null
}

export function useMantelRecoveryCode() {
  const mantelKeys = useMantelKeys()

  /** Returns the mantel's new recovery code, to be shown once. */
  async function makeNew(mantel: CurrentMantel): Promise<NewCodeOutcome> {
    const key = await mantelKeys.open(mantel)
    // Only the mantel's own key may be locked under its code.
    if (!key || (await publicKeyOf(await importPrivateKey(key))) !== mantel.publicKey) {
      return { status: 'cannot-open' }
    }
    const secret = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES))
    const proofHash = await recoveryProofHash(await recoveryProof(secret))
    const code = formatRecoveryCode(secret)
    writePendingCode('recovery', mantel.id, { publicKey: mantel.publicKey, code })
    try {
      await $fetch('/api/mantels/recovery-code', {
        method: 'POST',
        body: {
          mantelId: mantel.id,
          keyVersion: mantel.keyVersion,
          publicKey: mantel.publicKey,
          recoveryWrap: await wrapMantelKeyUnderCode(secret, mantel.id, key),
          recoveryProofHash: proofHash,
        },
      })
      return { status: 'made', code }
    } catch (error) {
      const reason = (error as { data?: { data?: { reason?: string } } }).data?.data?.reason
      if (reason === 'rekey-due' || reason === 'changed') {
        writePendingCode('recovery', mantel.id, null)
        return { status: reason }
      }
      // No refusal came back, so the code may have been stored all the same.
      if ((await currentProofHash(mantel.id)) === proofHash) return { status: 'made', code }
      return { status: 'failed' }
    }
  }

  async function currentProofHash(mantelId: string): Promise<string | null> {
    try {
      const view = await $fetch<{ recoveryProofHash: string | null }>('/api/mantels/view', {
        method: 'POST',
        body: { id: mantelId },
      })
      return view.recoveryProofHash
    } catch {
      return null
    }
  }

  /**
   * A code this device made that is the mantel's code now and that nobody
   * has confirmed keeping. One that never became the mantel's is forgotten.
   */
  async function unconfirmedCode(mantel: {
    id: string
    publicKey: string
    recoveryProofHash: string | null
  }): Promise<string | null> {
    const pending = readPendingCode('recovery', mantel.id)
    if (!pending) return null
    if (
      pending.publicKey === mantel.publicKey &&
      (await hashOf(pending.code)) === mantel.recoveryProofHash
    ) {
      return pending.code
    }
    writePendingCode('recovery', mantel.id, null)
    return null
  }

  return {
    makeNew,
    unconfirmedCode,
    confirmCode: (mantelId: string) => writePendingCode('recovery', mantelId, null),
  }
}

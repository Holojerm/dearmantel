// Changing a mantel's key, in a keeper's browser, after another keeper has
// left or once the keepers agreed it got out: a new key pair and recovery code, the new key for each keeper who
// remains, and every letter key the mantel holds wrapped again to the new
// key. The server is sent only wrapped keys and stores them all at once.

import { importPrivateKey, publicKeyOf } from '#layers/keys/app/utils/key-crypto'
import {
  generateMantelKeys,
  recoveryProof,
  recoveryProofHash,
  wrapMantelKeyForHandover,
  wrapMantelKeyForKeeper,
  wrapMantelKeyUnderCode,
} from '#layers/keys/app/utils/mantel-crypto'
import type { KeptMantel } from '#layers/keys/app/composables/useMantelKeys'
import {
  readPendingCode,
  writePendingCode,
  type PendingCode,
} from '#layers/keys/app/utils/pending-recovery-code'
import { formatRecoveryCode, RECOVERY_CODE_BYTES } from '#layers/keys/shared/utils/key-format'

import { rewrapLetterKeys, type HeldLetterKey } from '../utils/rekey-letters'

interface RekeyPlan {
  keyVersion: number
  publicKey: string
  others: { userId: string; publicKey: string }[]
  letterKeys: HeldLetterKey[]
}

export type RekeyOutcome =
  | { status: 'rekeyed'; code: string }
  | { status: 'cannot-open' | 'busy' | 'failed' }

// A letter can arrive while the keys are being wrapped. The server then
// stores nothing and this starts again from what is there now.
const ATTEMPTS = 3

// The new recovery code stays on this device until the keeper confirms they
// have it (pending-recovery-code.ts).
const readPending = (mantelId: string) => readPendingCode('rekey', mantelId)
const writePending = (mantelId: string, pending: PendingCode | null) =>
  writePendingCode('rekey', mantelId, pending)

export function useMantelRekey() {
  const { user } = useUserSession()
  const mantelKeys = useMantelKeys()

  /** Returns the mantel's new recovery code, to be shown once. */
  async function rekey(mantel: KeptMantel): Promise<RekeyOutcome> {
    const keeperId = user.value?.id
    const previous = await mantelKeys.open(mantel)
    if (!keeperId || !previous) return { status: 'cannot-open' }
    const previousKey = await importPrivateKey(previous)
    const held = await publicKeyOf(previousKey)

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const plan = await $fetch<RekeyPlan>('/api/letters/kept/rekey-plan', {
        method: 'POST',
        body: { mantelId: mantel.id },
      })
      // Only the key the mantel has now can open what must be wrapped again.
      if (plan.publicKey !== held) return { status: 'cannot-open' }

      const next = await generateMantelKeys()
      const code = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES))
      const context = { mantelId: mantel.id, keeperId }
      const body = {
        mantelId: mantel.id,
        keyVersion: plan.keyVersion,
        publicKey: next.publicKey,
        keeperWrap: await wrapMantelKeyForKeeper(
          await mantelKeys.myPublicKey(),
          next.privateKey,
          context,
        ),
        recoveryWrap: await wrapMantelKeyUnderCode(code, mantel.id, next.privateKey),
        recoveryProofHash: await recoveryProofHash(await recoveryProof(code)),
        handovers: Object.fromEntries(
          await Promise.all(
            plan.others.map(async (other) => [
              other.userId,
              await wrapMantelKeyForHandover(other.publicKey, previous, next.privateKey, {
                mantelId: mantel.id,
                keeperId: other.userId,
              }),
            ]),
          ),
        ),
        letterKeys: await rewrapLetterKeys(previousKey, next.publicKey, mantel.id, plan.letterKeys),
      }
      const shown = formatRecoveryCode(code)
      writePending(mantel.id, { publicKey: next.publicKey, code: shown })
      try {
        await $fetch('/api/letters/kept/rekey', { method: 'POST', body })
        return { status: 'rekeyed', code: shown }
      } catch (error) {
        const reason = (error as { data?: { data?: { reason?: string } } }).data?.data?.reason
        if (reason === 'changed' || reason === 'keepers-changed') {
          writePending(mantel.id, null)
          continue
        }
        // No refusal came back, so the key may have been stored all the same.
        if (await isKeyOf(mantel.id, next.publicKey)) return { status: 'rekeyed', code: shown }
        return { status: 'failed' }
      }
    }
    return { status: 'busy' }
  }

  /** Whether the mantel's key is now this one. False when it cannot be asked. */
  async function isKeyOf(mantelId: string, publicKey: string): Promise<boolean> {
    try {
      const view = await $fetch<{ publicKey: string }>('/api/mantels/view', {
        method: 'POST',
        body: { id: mantelId },
      })
      return view.publicKey === publicKey
    } catch {
      return false
    }
  }

  /**
   * A new recovery code this device made for the mantel's current key and
   * that nobody has confirmed keeping. One made for a key that never became
   * the mantel's is forgotten.
   */
  function unconfirmedCode(mantel: { id: string; publicKey: string }): string | null {
    const pending = readPending(mantel.id)
    if (!pending) return null
    if (pending.publicKey === mantel.publicKey) return pending.code
    writePending(mantel.id, null)
    return null
  }

  return { rekey, unconfirmedCode, confirmCode: (mantelId: string) => writePending(mantelId, null) }
}

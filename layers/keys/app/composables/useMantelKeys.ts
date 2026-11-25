// A keeper's side of a custodial mantel's key: making the pair, wrapping it,
// and opening this keeper's own copy. The mantel's private key is only ever
// in memory here; it is not written to the device.

import {
  formatRecoveryCode,
  parseRecoveryCode,
  RECOVERY_CODE_BYTES,
} from '../../shared/utils/key-format'
import type { MantelKind } from '../../shared/utils/mantel-format'
import {
  generateMantelKeys,
  keyFingerprint,
  recoveryProof,
  recoveryProofHash,
  openHandoverChain,
  unwrapMantelKey,
  wrapMantelKeyForKeeper,
  wrapMantelKeyUnderCode,
} from '../utils/mantel-crypto'
import { isMantelKey, openKeeperCopy, openRecoveryCopy } from '../utils/mantel-key-check'

export interface KeptMantel {
  id: string
  wrappedKey: string | null
  /** The version of the mantel's key the wraps here belong to. */
  keyVersion?: number
  /** After a re-key, until this keeper's browser has opened the new key. */
  handover?: { previous: string; wrapped: string } | null
  /** The mantel's public key as the server gives it: any copy opened must be its pair. */
  publicKey: string
}

export function useMantelKeys() {
  const { user } = useUserSession()
  const keys = useKeys()

  const me = () => {
    const id = user.value?.id
    if (!id) throw new Error('Not signed in')
    return id
  }

  // Worked out from the key this device holds, never asked of the server: a
  // mantel's key wrapped to a public key the server chose would be the
  // server's to open.
  async function myPublicKey(): Promise<string> {
    const privateKey = await keys.privateKey()
    if (!privateKey) throw new Error('This device does not hold your key')
    return publicKeyOf(privateKey)
  }

  /**
   * After a re-key by another keeper: opens the new key left for this one,
   * which takes this account's key and the mantel's key from before (once
   * for each re-key this keeper was not there for), and stores an ordinary
   * copy in place of them.
   */
  async function takeHandover(
    privateKey: CryptoKey,
    mantel: KeptMantel,
  ): Promise<Uint8Array<ArrayBuffer> | null> {
    if (!mantel.handover || !mantel.keyVersion) return null
    const context = { mantelId: mantel.id, keeperId: me() }
    const previous = await unwrapMantelKey(privateKey, mantel.handover.previous, context)
    if (!previous) return null
    const mantelKey = await openHandoverChain(
      privateKey,
      previous,
      mantel.handover.wrapped,
      context,
    )
    if (!mantelKey) return null
    // What was handed over must be the key letters are now sealed to. A copy
    // of anything else is not stored, and not passed on to a new keeper.
    if (!(await isMantelKey(mantelKey, mantel.publicKey))) return null
    // If storing the copy fails the key is still good for this visit, and the
    // two copies it came from are still there for the next.
    await $fetch('/api/mantels/rekey/settle', {
      method: 'POST',
      body: {
        mantelId: mantel.id,
        keyVersion: mantel.keyVersion,
        wrapped: await wrapMantelKeyForKeeper(await myPublicKey(), mantelKey, context),
      },
    }).catch(() => null)
    return mantelKey
  }

  /**
   * This keeper's copy of the mantel's private key, opened. Null if this
   * device cannot, or if the copy holds any key but the mantel's own.
   */
  async function open(mantel: KeptMantel): Promise<Uint8Array<ArrayBuffer> | null> {
    const privateKey = await keys.privateKey()
    if (!privateKey) return null
    if (!mantel.wrappedKey) return takeHandover(privateKey, mantel)
    const context = { mantelId: mantel.id, keeperId: me() }
    return openKeeperCopy(privateKey, mantel.wrappedKey, context, mantel.publicKey)
  }

  return {
    open,
    myPublicKey,
    /** What the person being seated reads out to the keeper seating them. */
    myFingerprint: async () => keyFingerprint(await myPublicKey()),

    /** Makes a mantel's keys here and opens it. Returns its recovery code, shown once. */
    async create(input: { kind: MantelKind; name: string }): Promise<{ id: string; code: string }> {
      const id = crypto.randomUUID()
      const pair = await generateMantelKeys()
      const secret = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES))
      await $fetch('/api/mantels', {
        method: 'POST',
        body: {
          id,
          ...input,
          publicKey: pair.publicKey,
          keeperWrap: await wrapMantelKeyForKeeper(await myPublicKey(), pair.privateKey, {
            mantelId: id,
            keeperId: me(),
          }),
          recoveryWrap: await wrapMantelKeyUnderCode(secret, id, pair.privateKey),
          recoveryProofHash: await recoveryProofHash(await recoveryProof(secret)),
        },
      })
      return { id, code: formatRecoveryCode(secret) }
    },

    /**
     * Uses a mantel's recovery code: finds the mantel, opens the copy of its
     * key that is locked under the code, and wraps it to this account. A
     * keeper gets their access back at once; anyone else starts the wait.
     */
    async recover(code: string) {
      const secret = parseRecoveryCode(code)
      if (!secret) return { status: 'bad-code' as const }
      const proof = await recoveryProof(secret)
      const found = await $fetch<
        | { status: 'unknown' }
        | {
            status: 'found'
            mantelId: string
            name: string
            publicKey: string
            recoveryWrap: string
          }
      >('/api/mantels/recover/find', { method: 'POST', body: { proof } })
      if (found.status !== 'found') return { status: 'unknown' as const }
      const mantelKey = await openRecoveryCopy(
        secret,
        found.mantelId,
        found.recoveryWrap,
        found.publicKey,
      )
      if (!mantelKey) return { status: 'unknown' as const }
      const claimed = await $fetch<{ status: 'restored' } | { status: 'waiting'; readyAt: string }>(
        '/api/mantels/recover/claim',
        {
          method: 'POST',
          body: {
            proof,
            wrapped: await wrapMantelKeyForKeeper(await myPublicKey(), mantelKey, {
              mantelId: found.mantelId,
              keeperId: me(),
            }),
          },
        },
      )
      return { ...claimed, mantelId: found.mantelId, name: found.name }
    },

    /** The key of the person waiting for a seat, and its fingerprint to compare. */
    async seatToFill(proposalId: string) {
      const seat = await $fetch<{ subjectId: string; publicKey: string }>(
        '/api/mantels/proposals/seat',
        { method: 'POST', body: { id: proposalId } },
      )
      return { ...seat, fingerprint: await keyFingerprint(seat.publicKey) }
    },

    /** Wraps the mantel's key to the new keeper, after the fingerprints matched. */
    async grant(
      proposalId: string,
      mantel: KeptMantel,
      seat: { subjectId: string; publicKey: string },
    ): Promise<boolean> {
      const mantelKey = await open(mantel)
      if (!mantelKey) return false
      await $fetch('/api/mantels/proposals/seat', {
        method: 'POST',
        body: {
          id: proposalId,
          keyVersion: mantel.keyVersion,
          wrapped: await wrapMantelKeyForKeeper(seat.publicKey, mantelKey, {
            mantelId: mantel.id,
            keeperId: seat.subjectId,
          }),
        },
      })
      return true
    },
  }
}

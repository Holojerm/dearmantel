// Making a child's letters their own, in the child's browser: each letter's
// content key is opened with the mantel's key and wrapped to the child's own
// account key. The letters themselves are not touched, or needed. Each new
// copy is opened again with the child's key before it is sent, because once
// the handover finishes the mantel's copy is gone.

import { unwrapContentKey, wrapContentKey } from './letter-crypto'
import type { HeldLetterKey } from './rekey-letters'

export interface ChildKeys {
  /** The child's own account key pair. */
  privateKey: CryptoKey
  publicKey: string
  childId: string
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, index) => byte === b[index])

/**
 * `mantelKey` must be the mantel's private key, checked against its public
 * key by the caller. A copy that does not open with it was never readable (a
 * writer can send anything in its place), so it is carried over as it is.
 * Throws if a new copy does not open for the child: nothing is sent then.
 */
export async function wrapLetterKeysForChild(
  mantelKey: CryptoKey,
  mantelId: string,
  child: ChildKeys,
  held: HeldLetterKey[],
): Promise<HeldLetterKey[]> {
  const moved: HeldLetterKey[] = []
  for (const { letterId, wrappedKey } of held) {
    const contentKey = await unwrapContentKey(mantelKey, wrappedKey, {
      letterId,
      readerId: mantelId,
    })
    if (!contentKey) {
      moved.push({ letterId, wrappedKey })
      continue
    }
    const context = { letterId, readerId: child.childId }
    const wrapped = await wrapContentKey(child.publicKey, contentKey, context)
    const check = await unwrapContentKey(child.privateKey, wrapped, context)
    if (!check || !sameBytes(check, contentKey)) {
      throw new Error('A letter key did not open again for the child')
    }
    moved.push({ letterId, wrappedKey: wrapped })
  }
  return moved
}

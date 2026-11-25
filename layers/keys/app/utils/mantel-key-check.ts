// A mantel's private key, however it reached this browser, is used as the
// mantel's only when its public half is the mantel's public key: the one
// letters are sealed to. Otherwise a keeper could seat someone, or lock a
// recovery code, with a decoy that opens none of the mantel's letters, and
// that person would pass it on as the real one.

import { importPrivateKey, publicKeyOf } from './key-crypto'
import { unwrapMantelKey, unwrapMantelKeyWithCode, type KeeperContext } from './mantel-crypto'

type Bytes = Uint8Array<ArrayBuffer>

export async function isMantelKey(mantelKey: Bytes, publicKey: string): Promise<boolean> {
  if (!publicKey) return false
  try {
    return (await publicKeyOf(await importPrivateKey(mantelKey))) === publicKey
  } catch {
    return false
  }
}

const checked = async (key: Bytes | null, publicKey: string) =>
  key && (await isMantelKey(key, publicKey)) ? key : null

/** A keeper's own copy, opened. Null if it is not theirs, or not the mantel's key. */
export async function openKeeperCopy(
  accountPrivateKey: CryptoKey,
  wrapped: string,
  context: KeeperContext,
  publicKey: string,
): Promise<Bytes | null> {
  return checked(await unwrapMantelKey(accountPrivateKey, wrapped, context), publicKey)
}

/** The copy under a recovery code, opened. Null on a wrong code, or a key not the mantel's. */
export async function openRecoveryCopy(
  code: Bytes,
  mantelId: string,
  wrapped: string,
  publicKey: string,
): Promise<Bytes | null> {
  return checked(await unwrapMantelKeyWithCode(code, mantelId, wrapped), publicKey)
}

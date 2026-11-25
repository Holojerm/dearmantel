// Checks a mantel's printed recovery code on this device before its only
// keeper deletes their account: the code must find that mantel and open the
// copy of its key locked under it. Only the proof the code derives is sent,
// as when the code is used; the code and the key stay here.

import { parseRecoveryCode } from '../../shared/utils/key-format'
import { recoveryProof } from './mantel-crypto'
import { openRecoveryCopy } from './mantel-key-check'

export type CodeCheck = { status: 'opens'; proof: string } | { status: 'bad-code' | 'wrong' }

export async function checkMantelCode(code: string, mantelId: string): Promise<CodeCheck> {
  const secret = parseRecoveryCode(code)
  if (!secret) return { status: 'bad-code' }
  const proof = await recoveryProof(secret)
  const found = await $fetch<
    | { status: 'unknown' }
    | { status: 'found'; mantelId: string; publicKey: string; recoveryWrap: string }
  >('/api/mantels/recover/find', { method: 'POST', body: { proof } })
  if (found.status !== 'found' || found.mantelId !== mantelId) return { status: 'wrong' }
  // A code that matched but did not open the mantel's own key would leave
  // nothing to open the letters with once the account is gone.
  if (!(await openRecoveryCopy(secret, mantelId, found.recoveryWrap, found.publicKey))) {
    return { status: 'wrong' }
  }
  return { status: 'opens', proof }
}

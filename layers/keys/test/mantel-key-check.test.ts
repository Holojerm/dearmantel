// A mantel's key is taken as the mantel's only when its public half is the
// mantel's public key (pentest DP-13). A keeper who wraps a decoy to someone
// they seat, or locks one under a recovery code, gets it refused.

import { describe, expect, it } from 'vitest'

import { generateAccountKeys, importPrivateKey } from '../app/utils/key-crypto'
import {
  generateMantelKeys,
  wrapMantelKeyForKeeper,
  wrapMantelKeyUnderCode,
} from '../app/utils/mantel-crypto'
import { isMantelKey, openKeeperCopy, openRecoveryCopy } from '../app/utils/mantel-key-check'

const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const context = { mantelId: MANTEL, keeperId: 'cal' }
const code = new Uint8Array(20).fill(7)

async function cal() {
  const keys = await generateAccountKeys()
  return { publicKey: keys.publicKey, privateKey: await importPrivateKey(keys.privateKey) }
}

describe('a mantel key is checked against the mantel', () => {
  it("opens a new keeper's copy of the mantel's own key", async () => {
    const [seated, mantel] = await Promise.all([cal(), generateMantelKeys()])
    const wrapped = await wrapMantelKeyForKeeper(seated.publicKey, mantel.privateKey, context)
    expect(await openKeeperCopy(seated.privateKey, wrapped, context, mantel.publicKey)).toEqual(
      mantel.privateKey,
    )
  })

  it('refuses a decoy wrapped to the new keeper', async () => {
    const [seated, mantel, decoy] = await Promise.all([
      cal(),
      generateMantelKeys(),
      generateMantelKeys(),
    ])
    const wrapped = await wrapMantelKeyForKeeper(seated.publicKey, decoy.privateKey, context)
    expect(await openKeeperCopy(seated.privateKey, wrapped, context, mantel.publicKey)).toBeNull()
  })

  it('opens the recovery copy of its own key and refuses a decoy under the code', async () => {
    const [mantel, decoy] = await Promise.all([generateMantelKeys(), generateMantelKeys()])
    const real = await wrapMantelKeyUnderCode(code, MANTEL, mantel.privateKey)
    const fake = await wrapMantelKeyUnderCode(code, MANTEL, decoy.privateKey)
    expect(await openRecoveryCopy(code, MANTEL, real, mantel.publicKey)).toEqual(mantel.privateKey)
    expect(await openRecoveryCopy(code, MANTEL, fake, mantel.publicKey)).toBeNull()
  })

  it('takes nothing that is not a private key, or with no public key to check', async () => {
    const mantel = await generateMantelKeys()
    expect(await isMantelKey(new Uint8Array(32), mantel.publicKey)).toBe(false)
    expect(await isMantelKey(mantel.privateKey, '')).toBe(false)
    expect(await isMantelKey(mantel.privateKey, mantel.publicKey)).toBe(true)
  })
})

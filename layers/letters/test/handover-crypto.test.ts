// A handover in real keys: the child's browser opens the copy of the mantel's
// key a keeper wrapped to them, and wraps each letter key again to the child's
// own key, so the child reads every letter and the mantel's key opens none of
// the new copies.

import { describe, expect, it } from 'vitest'

import { generateAccountKeys, importPrivateKey } from '#layers/keys/app/utils/key-crypto'
import { generateMantelKeys, wrapMantelKeyForKeeper } from '#layers/keys/app/utils/mantel-crypto'
import { openKeeperCopy } from '#layers/keys/app/utils/mantel-key-check'

import { wrapLetterKeysForChild } from '../app/utils/handover-letters'
import {
  decryptLetter,
  encryptLetter,
  newContentKey,
  unwrapContentKey,
  wrapContentKey,
} from '../app/utils/letter-crypto'
import { letterKeySchema } from '../shared/utils/letter-doc'

const MANTEL = '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11'
const LEO = 'leo-account'
const letterId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

async function letterTo(mantelPublicKey: string, n: number, text: string) {
  const id = letterId(n)
  const key = newContentKey()
  return {
    letterId: id,
    ciphertext: await encryptLetter(key, id, text),
    wrappedKey: await wrapContentKey(mantelPublicKey, key, { letterId: id, readerId: MANTEL }),
  }
}

describe('making the letters the child’s', () => {
  it('lets the child read every letter with their own key, after opening the key a keeper gave', async () => {
    const mantel = await generateMantelKeys()
    const leo = await generateAccountKeys()
    const leoKey = await importPrivateKey(leo.privateKey)
    // A keeper's browser, after the fingerprint check.
    const given = await wrapMantelKeyForKeeper(leo.publicKey, mantel.privateKey, {
      mantelId: MANTEL,
      keeperId: LEO,
    })
    const opened = await openKeeperCopy(
      leoKey,
      given,
      { mantelId: MANTEL, keeperId: LEO },
      mantel.publicKey,
    )
    expect(opened).not.toBeNull()

    const written = [
      await letterTo(mantel.publicKey, 1, 'For when you are eighteen.'),
      await letterTo(mantel.publicKey, 2, 'The plums are ripe.'),
    ]
    const moved = await wrapLetterKeysForChild(
      await importPrivateKey(opened!),
      MANTEL,
      { privateKey: leoKey, publicKey: leo.publicKey, childId: LEO },
      written,
    )

    expect(moved.map((key) => key.letterId)).toEqual([letterId(1), letterId(2)])
    for (const [index, key] of moved.entries()) {
      expect(letterKeySchema.safeParse(key.wrappedKey).success).toBe(true)
      const context = { letterId: key.letterId, readerId: LEO }
      const content = await unwrapContentKey(leoKey, key.wrappedKey, context)
      expect(await decryptLetter(content!, key.letterId, written[index]!.ciphertext)).toBe(
        index === 0 ? 'For when you are eighteen.' : 'The plums are ripe.',
      )
      // The mantel's key, which former keepers may still hold, opens none of them.
      const mantelKey = await importPrivateKey(mantel.privateKey)
      expect(await unwrapContentKey(mantelKey, key.wrappedKey, context)).toBeNull()
      expect(
        await unwrapContentKey(mantelKey, key.wrappedKey, { ...context, readerId: MANTEL }),
      ).toBeNull()
    }
  })

  it('carries over a copy that never opened, rather than stopping', async () => {
    const mantel = await generateMantelKeys()
    const leo = await generateAccountKeys()
    const junk = { letterId: letterId(3), wrappedKey: `v1.${'A'.repeat(87)}.${'B'.repeat(16)}.C` }
    const moved = await wrapLetterKeysForChild(
      await importPrivateKey(mantel.privateKey),
      MANTEL,
      {
        privateKey: await importPrivateKey(leo.privateKey),
        publicKey: leo.publicKey,
        childId: LEO,
      },
      [junk],
    )
    expect(moved).toEqual([junk])
  })

  it('refuses a key to wrap to that is not the child’s own', async () => {
    const mantel = await generateMantelKeys()
    const leo = await generateAccountKeys()
    const other = await generateAccountKeys()
    await expect(
      wrapLetterKeysForChild(
        await importPrivateKey(mantel.privateKey),
        MANTEL,
        // Wrapped to someone else's key, it would not open for the child.
        {
          privateKey: await importPrivateKey(leo.privateKey),
          publicKey: other.publicKey,
          childId: LEO,
        },
        [await letterTo(mantel.publicKey, 4, 'Hello.')],
      ),
    ).rejects.toThrow()
  })
})

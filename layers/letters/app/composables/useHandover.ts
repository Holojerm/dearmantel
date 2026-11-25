// Taking a child's mantel, in the child's browser, once a keeper has handed
// them its key. The letter keys are wrapped again to the child's own key a
// batch at a time and kept on the server until the last step, which makes
// the mantel theirs in one go. A browser that closes halfway starts again
// from what the server already holds.

import { importPrivateKey } from '#layers/keys/app/utils/key-crypto'
import { openKeeperCopy } from '#layers/keys/app/utils/mantel-key-check'

import { wrapLetterKeysForChild } from '../utils/handover-letters'
import type { HeldLetterKey } from '../utils/rekey-letters'

interface Take {
  mantelId: string
  publicKey: string
  wrapped: string
  letterKeys: HeldLetterKey[]
  left: number
}

export type TakeOutcome = 'taken' | 'cannot-open' | 'busy' | 'failed'

// Letters can keep arriving while this runs; each time the last step finds
// one, the new ones are wrapped and it tries again.
const ATTEMPTS = 5

const reason = (error: unknown) =>
  (error as { data?: { data?: { reason?: string } } }).data?.data?.reason

export function useHandover() {
  const { user } = useUserSession()
  const keys = useKeys()
  const mantelKeys = useMantelKeys()

  // The last step is safe to send twice: a mantel already handed over to
  // this child says so again. So an answer lost on the way back is asked once more.
  async function close(mantelId: string) {
    const send = () => $fetch('/api/letters/handover/close', { method: 'POST', body: { mantelId } })
    try {
      await send()
    } catch (error) {
      if (reason(error)) throw error
      await send()
    }
  }

  const take = (mantelId: string) =>
    $fetch<Take>('/api/letters/handover/take', { method: 'POST', body: { mantelId } })

  /** Wraps every letter key again and finishes. `progress` counts the letters done. */
  async function takeMantel(
    mantelId: string,
    progress: (done: number, total: number) => void = () => {},
  ): Promise<TakeOutcome> {
    const childId = user.value?.id
    const privateKey = await keys.privateKey()
    if (!childId || !privateKey) return 'cannot-open'
    try {
      let next = await take(mantelId)
      const mantelBytes = await openKeeperCopy(
        privateKey,
        next.wrapped,
        { mantelId, keeperId: childId },
        next.publicKey,
      )
      if (!mantelBytes) return 'cannot-open'
      const mantelKey = await importPrivateKey(mantelBytes)
      const child = { privateKey, publicKey: await mantelKeys.myPublicKey(), childId }

      let done = 0
      for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        while (next.letterKeys.length > 0) {
          progress(done, done + next.letterKeys.length + next.left)
          const letterKeys = await wrapLetterKeysForChild(
            mantelKey,
            mantelId,
            child,
            next.letterKeys,
          )
          await $fetch('/api/letters/handover/move', {
            method: 'POST',
            body: { mantelId, letterKeys },
          })
          done += letterKeys.length
          next = await take(mantelId)
        }
        progress(done, done)
        try {
          await close(mantelId)
          return 'taken'
        } catch (error) {
          if (reason(error) !== 'letters-left') throw error
          next = await take(mantelId)
        }
      }
      return 'busy'
    } catch {
      return 'failed'
    }
  }

  return { takeMantel }
}

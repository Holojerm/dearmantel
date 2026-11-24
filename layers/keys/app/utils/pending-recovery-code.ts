// A new mantel recovery code, kept on the device that made it until the
// keeper confirms they have it. Once the server stores the new copy the old
// code is dead, and the new one cannot be made again: so it is written here
// before the request goes, and a lost reply or a closed tab loses nothing.
//
// `slot` keeps the re-key's code and a plain new code apart, so each is shown
// by the part of the page that made it.

export interface PendingCode {
  /** The key the code belongs to. It counts only while that is the mantel's key. */
  publicKey: string
  code: string
}

export type PendingSlot = 'rekey' | 'recovery'

const storageName = (slot: PendingSlot, mantelId: string) => `dearmantel:${slot}-code:${mantelId}`

export function readPendingCode(slot: PendingSlot, mantelId: string): PendingCode | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem(storageName(slot, mantelId)) ?? 'null',
    ) as unknown
    const { publicKey, code } = (stored ?? {}) as Partial<PendingCode>
    return typeof publicKey === 'string' && typeof code === 'string' ? { publicKey, code } : null
  } catch {
    return null
  }
}

// Storage can refuse (a private window). The change still works; only the
// second chance to see the code is lost.
export function writePendingCode(
  slot: PendingSlot,
  mantelId: string,
  pending: PendingCode | null,
): void {
  try {
    if (pending) localStorage.setItem(storageName(slot, mantelId), JSON.stringify(pending))
    else localStorage.removeItem(storageName(slot, mantelId))
  } catch {
    // Nothing to do.
  }
}

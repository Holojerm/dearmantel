// The copy of their letters a person can keep: one archive per
// correspondence, built in their browser, since only it can read them.

export interface ArchiveEntry {
  id: string
  direction: 'sent' | 'received'
  /** Who wrote a received letter. Null when that account is gone, and for sent ones. */
  from: string | null
  /** 'YYYY-MM-DD', the sender's calendar. */
  postmark: string | null
  /** Written from a write link, by someone with no account. */
  guest?: boolean
  /**
   * Who a sent letter went to, when the shelf's name is not them: a kept
   * mantel's shelf is named for the child, who wrote it. Null when they have gone.
   */
  to?: string | null
}

export interface ArchiveShelf {
  correspondenceId: string
  /** The other person, the kept mantel, or the family. Empty when they have gone. */
  name: string
  /** 'kept' is a mantel as its keeper sees it: everything opened on it, not only their own. */
  kind: 'person' | 'mantel' | 'family' | 'kept' | 'news'
  entries: ArchiveEntry[]
  /** Letters that have arrived and not been opened. Making a copy opens nothing. */
  unopened: number
}

/** What a keeper may copy from a kept mantel, and how many letters were left out. */
export interface KeptArchive {
  entries: ArchiveEntry[]
  /** Arrived, not sealed, and not opened by any keeper yet. */
  unopened: number
  /** Still sealed until their day. */
  sealed: number
}

/** The encrypted parts of one letter, for its author or a reader who has opened it. */
export interface ArchiveSealed {
  ciphertext: string
  wrappedKey: string
  hasPhoto: boolean
}

/** A name that is safe in a file path on any system. */
export function fileSafe(text: string): string {
  const cleaned = text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim()
  return cleaned || 'letter'
}

/** Who a sent letter went to: the shelf's other person, unless the entry names its own. */
export function sentTo(entry: ArchiveEntry, who: string): string {
  if (entry.to === undefined) return who
  return entry.to ?? 'someone who has left'
}

/** The copy's title. `who` is the shelf's name, or a stand-in when it has none. */
export function shelfTitle(shelf: Pick<ArchiveShelf, 'kind' | 'entries'>, who: string): string {
  if (shelf.kind === 'kept') {
    const wrote = shelf.entries.some((entry) => entry.direction === 'sent')
    return wrote ? `Letters to and from ${who}` : `Letters to ${who}`
  }
  if (shelf.kind === 'family') return `Letters in ${who}`
  if (shelf.kind === 'news') return `News of ${who}`
  return `Letters with ${who}`
}

/** "003 2026-11-20 from Ann Lee": in order, dated, and readable in a file list. */
export function entryFileName(index: number, entry: ArchiveEntry, who: string): string {
  const number = String(index + 1).padStart(3, '0')
  const direction = entry.direction === 'sent' ? 'to' : 'from'
  return fileSafe(`${number} ${entry.postmark ?? 'undated'} ${direction} ${who}`)
}

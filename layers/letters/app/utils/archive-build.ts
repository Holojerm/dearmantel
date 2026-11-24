// Builds the copy of a correspondence a person keeps: each letter is fetched
// encrypted, opened with this device's key, and written out as plain text,
// with its photo, beside one page that shows them all. Nothing readable
// leaves the device; the archive itself is not encrypted.

import {
  entryFileName,
  sentTo,
  shelfTitle,
  type ArchiveEntry,
  type ArchiveSealed,
  type ArchiveShelf,
} from '../../shared/utils/archive'
import { archivePage, type ArchivePageLetter } from '../../shared/utils/archive-page'
import { parseLetterDoc, type LetterDoc } from '../../shared/utils/letter-doc'
import { richDocToText } from '../../shared/utils/rich-plain'
import { decryptLetter } from './letter-crypto'
import { decryptPhoto } from './photo-crypto'
import { yearDay } from './stationery'
import { ZIP_BYTES_MAX, zipBlob, type ZipFile } from '#layers/post/app/utils/zip'

type Bytes = Uint8Array<ArrayBuffer>

export interface ArchiveResult {
  blob: Blob
  /** Letters that could not be opened on this device and were left out. */
  skipped: number
  letters: number
}

export type OpenKey = (wrapped: string, letterId: string) => Promise<Bytes | null>

const encoder = new TextEncoder()

/** Where a letter's encrypted parts come from. A keeper's copy of a mantel reads elsewhere. */
export interface ArchiveSource {
  sealed: (letterId: string) => Promise<ArchiveSealed>
  photo: (letterId: string) => Promise<ArrayBuffer>
}

const OWN_LETTERS: ArchiveSource = {
  sealed: (id) =>
    $fetch<ArchiveSealed>('/api/letters/archive/letter', { method: 'POST', body: { id } }),
  photo: (id) => $fetch<ArrayBuffer>(`/api/letters/photo/${id}`, { responseType: 'arrayBuffer' }),
}

async function openEntry(entry: ArchiveEntry, openKey: OpenKey, source: ArchiveSource) {
  const sealed = await source.sealed(entry.id)
  const key = await openKey(sealed.wrappedKey, entry.id)
  const text = key ? await decryptLetter(key, entry.id, sealed.ciphertext) : null
  const doc = text ? parseLetterDoc(text) : null
  if (!key || !doc) return null
  let photo: ArrayBuffer | null = null
  if (doc.photo && sealed.hasPhoto) {
    try {
      const file = await source.photo(entry.id)
      photo = await decryptPhoto(key, { letterId: entry.id, photoId: doc.photo.id }, file)
    } catch {
      photo = null
    }
  }
  return { doc, photo }
}

function textFile(heading: string, when: string | null, doc: LetterDoc, photoFile: string | null) {
  const lines = [heading]
  if (when) lines.push(when)
  lines.push('', richDocToText(doc.content))
  if (doc.from) lines.push('', doc.from)
  if (doc.photo) {
    const about = doc.photo.alt ? `: ${doc.photo.alt}` : ''
    lines.push(
      '',
      photoFile ? `[Photo${about}. See ${photoFile}]` : `[Photo${about}. Not in this copy]`,
    )
  }
  return `${lines.join('\n')}\n`
}

/** The app the copy came from, as configured: `public.appName` and `public.appUrl`. */
export interface ArchiveSite {
  appName: string
  appUrl: string
}

function madeFrom({ appName, appUrl }: ArchiveSite): string {
  let host = ''
  try {
    host = new URL(appUrl).host
  } catch {
    // No usable URL configured: name the app alone.
  }
  return host ? `${appName} (${host})` : appName
}

const README = (title: string, made: string, site: ArchiveSite) =>
  [
    title,
    `Made on ${made} from ${madeFrom(site)}.`,
    '',
    'letters.html   every letter in order. Open it in any browser; print it to keep it on paper.',
    'letters/       each letter as a plain text file.',
    'photos/        the photos enclosed with them.',
    '',
    'These files are not encrypted. Anyone who has them can read them, so keep them where you',
    `would keep the letters themselves. Nothing here needs ${site.appName}, or any program in`,
    'particular, to be read.',
    '',
  ].join('\n')

/**
 * The archive of one correspondence. `today` is the reader's calendar day,
 * 'YYYY-MM-DD'. Throws only when the device is offline or signed out.
 */
export async function buildArchive(
  shelf: ArchiveShelf,
  openKey: OpenKey,
  today: string,
  site: ArchiveSite,
  onProgress: (done: number, total: number) => void,
  source: ArchiveSource = OWN_LETTERS,
): Promise<ArchiveResult> {
  const who = shelf.name || 'someone who has left'
  const title = shelfTitle(shelf, who)
  const files: ZipFile[] = []
  const page: ArchivePageLetter[] = []
  let skipped = 0
  let bytes = 0

  for (const [index, entry] of shelf.entries.entries()) {
    onProgress(index, shelf.entries.length)
    const opened = await openEntry(entry, openKey, source)
    if (!opened) {
      skipped += 1
      continue
    }
    const from = entry.from ?? opened.doc.from ?? (entry.guest ? 'a guest' : 'someone who has left')
    const to = sentTo(entry, who)
    const heading = entry.direction === 'sent' ? `To ${to}` : `From ${from}`
    const when = entry.postmark ? `Postmarked ${yearDay(entry.postmark)}` : null
    const base = entryFileName(index, entry, entry.direction === 'sent' ? to : from)
    const photoFile = opened.photo ? `photos/${base}.jpg` : null
    if (opened.photo && photoFile) {
      files.push({ name: photoFile, data: new Uint8Array(opened.photo) })
      bytes += opened.photo.byteLength
    }
    files.push({
      name: `letters/${base}.txt`,
      data: encoder.encode(textFile(heading, when, opened.doc, photoFile)),
    })
    page.push({ heading, when, doc: opened.doc, photoFile })
    if (bytes > ZIP_BYTES_MAX * 0.9)
      throw new Error('This correspondence is too large for one archive')
  }
  onProgress(shelf.entries.length, shelf.entries.length)

  const made = yearDay(today)
  const intro = `${page.length} ${page.length === 1 ? 'letter' : 'letters'}, as they stood on ${made}.`
  files.unshift(
    { name: 'README.txt', data: encoder.encode(README(title, made, site)) },
    { name: 'letters.html', data: encoder.encode(archivePage(title, intro, page)) },
  )
  return { blob: zipBlob(files, new Date()), skipped, letters: page.length }
}

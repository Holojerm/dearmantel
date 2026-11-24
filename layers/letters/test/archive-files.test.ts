// The files in the copy a person keeps: plain text, one page, and the zip
// that holds them. The page is written as text, so what a correspondent
// typed must come out escaped.

import { describe, expect, it } from 'vitest'

import { crc32, zipParts } from '#layers/post/app/utils/zip'
import { entryFileName, fileSafe, sentTo, shelfTitle } from '../shared/utils/archive'
import { archivePage } from '../shared/utils/archive-page'
import { DEFAULT_STATIONERY, type LetterDoc } from '../shared/utils/letter-doc'
import { richDocToText } from '../shared/utils/rich-plain'
import type { RichDoc } from '../shared/utils/rich-text'

const CONTENT: RichDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'August' }] },
    {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [
        { type: 'text', text: 'Plums & ' },
        { type: 'text', text: '<b>ripe</b>', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'Come soon.' },
      ],
    },
    { type: 'horizontalRule' },
    {
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Bring the dog' }] },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'and a lead' }] }],
                },
              ],
            },
          ],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stay a week' }] }],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'As you said.' }] }],
    },
  ],
}

const doc = (extra: Partial<LetterDoc> = {}): LetterDoc => ({
  v: 2,
  content: CONTENT,
  stationery: { ...DEFAULT_STATIONERY, font: 'hand', ink: 'accent' },
  from: 'Ann "A" <Lee>',
  ...extra,
})

describe('a letter as plain text', () => {
  it('keeps headings, lists, quotes and rules readable', () => {
    expect(richDocToText(CONTENT)).toBe(
      [
        'August',
        '======',
        '',
        'Plums & <b>ripe</b>',
        'Come soon.',
        '',
        '* * *',
        '',
        '1. Bring the dog',
        '   ',
        '   - and a lead',
        '2. Stay a week',
        '',
        '> As you said.',
      ].join('\n'),
    )
  })
})

describe('the page of letters', () => {
  const photo = {
    id: '4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11',
    width: 800,
    height: 600,
    alt: 'A "plum" tree',
  }
  const page = archivePage('Letters with <Bob>', '1 letter.', [
    {
      heading: 'From Ann & co',
      when: 'Postmarked 16 November 2026',
      doc: doc({ photo }),
      photoFile: 'photos/001 2026-11-16 from Ann.jpg',
    },
    { heading: 'To Bob', when: null, doc: doc({ photo }), photoFile: null },
  ])

  it('escapes every word a person wrote', () => {
    expect(page).toContain('<title>Letters with &lt;Bob&gt;</title>')
    expect(page).toContain('<h2>From Ann &amp; co</h2>')
    expect(page).toContain('<em><strong>&lt;b&gt;ripe&lt;/b&gt;</strong></em>')
    expect(page).toContain('<p class="signature">Ann &quot;A&quot; &lt;Lee&gt;</p>')
    expect(page).toContain('alt="A &quot;plum&quot; tree"')
    expect(page).not.toContain('<b>ripe')
    expect(page).not.toMatch(/<script|javascript:|\son\w+=/)
  })

  it('carries the paper, the alignment and the photo, or says the photo is missing', () => {
    expect(page).toContain('<article class="paper-plain ink-accent face-hand">')
    expect(page).toContain('<p class="center">Plums &amp; ')
    expect(page).toContain(
      '<img src="photos/001%202026-11-16%20from%20Ann.jpg" width="800" height="600"',
    )
    expect(page).toContain('This letter had a photo')
    expect(page).toContain('<ol><li><p>Bring the dog</p><ul><li><p>and a lead</p></li></ul></li>')
  })
})

describe('file names', () => {
  it('are safe on any system and say what the file is', () => {
    expect(fileSafe('  Ann/../Lee: "x"?  ')).toBe('Ann Lee x')
    expect(fileSafe('Zoë Ångström')).toBe('Zoë Ångström')
    expect(fileSafe('///')).toBe('letter')
    expect(
      entryFileName(
        2,
        { id: 'a', direction: 'received', from: 'Ann', postmark: '2026-11-16' },
        'Ann Lee',
      ),
    ).toBe('003 2026-11-16 from Ann Lee')
    expect(
      entryFileName(0, { id: 'a', direction: 'sent', from: null, postmark: null }, 'Bob'),
    ).toBe('001 undated to Bob')
  })
})

describe("a kept mantel's copy", () => {
  const sent = { id: 'a', direction: 'sent' as const, from: null, postmark: null }
  const received = { id: 'b', direction: 'received' as const, from: 'Ann', postmark: null }

  it('says the mantel wrote too, once it has', () => {
    expect(shelfTitle({ kind: 'kept', entries: [received] }, 'Leo')).toBe('Letters to Leo')
    expect(shelfTitle({ kind: 'kept', entries: [received, sent] }, 'Leo')).toBe(
      'Letters to and from Leo',
    )
    expect(shelfTitle({ kind: 'person', entries: [sent] }, 'Ann')).toBe('Letters with Ann')
  })

  it('addresses what the mantel wrote to its reader, not to the mantel', () => {
    expect(sentTo({ ...sent, to: 'Granny Eve' }, 'Leo')).toBe('Granny Eve')
    expect(sentTo({ ...sent, to: null }, 'Leo')).toBe('someone who has left')
    expect(sentTo(sent, 'Ann')).toBe('Ann')
  })
})

describe('the zip', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)
  const join = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let at = 0
    for (const part of parts) {
      out.set(part, at)
      at += part.length
    }
    return out
  }

  it('computes the checksum every unzip tool checks', () => {
    expect(crc32(bytes('hello'))).toBe(0x3610a686)
    expect(crc32(bytes(''))).toBe(0)
  })

  it('stores each file whole and lists it in the directory', () => {
    const files = [
      { name: 'README.txt', data: bytes('read me') },
      { name: 'letters/001 from Zoë.txt', data: bytes('Dear Ann') },
    ]
    const zip = join(zipParts(files, new Date(2026, 10, 16, 9, 30, 0)))
    const view = new DataView(zip.buffer)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    const directoryAt = view.getUint32(end + 16, true)
    expect(view.getUint32(directoryAt, true)).toBe(0x02014b50)
    expect(directoryAt + view.getUint32(end + 12, true)).toBe(end)

    // The second entry's directory record points at its own local header.
    const firstName = view.getUint16(directoryAt + 28, true)
    const second = directoryAt + 46 + firstName
    const offset = view.getUint32(second + 42, true)
    expect(view.getUint32(offset, true)).toBe(0x04034b50)
    const nameLength = view.getUint16(offset + 26, true)
    const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength))
    expect(name).toBe('letters/001 from Zoë.txt')
    const size = view.getUint32(offset + 18, true)
    const data = zip.slice(offset + 30 + nameLength, offset + 30 + nameLength + size)
    expect(new TextDecoder().decode(data)).toBe('Dear Ann')
    expect(view.getUint32(offset + 14, true)).toBe(crc32(bytes('Dear Ann')))
  })
})

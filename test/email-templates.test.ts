// The transactional emails: escaping, and the plain-text alternative.
//
// Names come from OAuth providers, which means they're attacker-controllable —
// "Ada <script>" is a valid GitHub display name. These render into HTML that
// gets delivered to an inbox, so escaping is the security-relevant part.

import { describe, expect, it } from 'vitest'
import { noteEmail, subscribeConfirmEmail } from '../server/utils/email-notes'
import { feedbackReplyEmail } from '../server/utils/email-templates'

const BRAND = { appName: 'My App', appUrl: 'https://example.com' }

describe('noteEmail', () => {
  const note = {
    subject: 'Exports are here',
    heading: 'Exports are here',
    paragraphs: ['First paragraph.', 'Second paragraph.'],
    button: { label: 'See what changed', url: 'https://example.com/changelog' },
    footnote: 'You are receiving this because you have an account.',
  }

  it('renders every paragraph, the button and the footnote in both parts', () => {
    const email = noteEmail(BRAND, note)
    expect(email.subject).toBe('Exports are here')
    for (const part of [email.html, email.text]) {
      expect(part).toContain('First paragraph.')
      expect(part).toContain('Second paragraph.')
      expect(part).toContain('https://example.com/changelog')
      expect(part).toContain('You are receiving this because')
    }
    expect(email.text).toContain('See what changed: https://example.com/changelog')
  })

  it('leaves the button out when there is none', () => {
    const email = noteEmail(BRAND, { ...note, button: undefined })
    expect(email.text).not.toContain('changelog')
    expect(email.text).not.toMatch(/\n{3,}/)
  })

  it('escapes hostile copy', () => {
    const email = noteEmail(BRAND, { ...note, paragraphs: ['<script>alert(1)</script>'] })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })
})

describe('subscribeConfirmEmail', () => {
  it('carries the link and says how long it works', () => {
    const email = subscribeConfirmEmail(BRAND, { url: 'https://example.com/c#s=1&t=2', days: 7 })
    expect(email.html).toContain('https://example.com/c#s=1&amp;t=2')
    expect(email.text).toContain('https://example.com/c#s=1&t=2')
    expect(email.text).toContain('7 days')
  })
})

describe('feedbackReplyEmail', () => {
  it('quotes back what the person originally wrote', () => {
    const email = feedbackReplyEmail(BRAND, {
      reply: 'Fixed in this morning\u2019s release \u2014 thanks for the report.',
      originalMessage: 'The export button does nothing on Safari',
    })
    expect(email.html).toContain('The export button does nothing on Safari')
    expect(email.subject).toContain('My App')
  })

  it('escapes the original message, which anyone on the internet can write', () => {
    // POST /api/feedback is public by design, so this string is genuinely
    // attacker-supplied — and it ends up in an email we send from our domain.
    const email = feedbackReplyEmail(BRAND, {
      reply: 'Thanks!',
      originalMessage: '<img src=x onerror="alert(1)">',
    })
    // Every email carries the logo as an <img>, so match the attacker's tag.
    expect(email.html).not.toContain('<img src=x')
    expect(email.html).toContain('&lt;img')
  })

  it('truncates a very long original rather than mailing the whole essay back', () => {
    const email = feedbackReplyEmail(BRAND, {
      reply: 'Noted.',
      originalMessage: 'x'.repeat(2000),
    })
    expect(email.html).toContain(`${'x'.repeat(600)}\u2026`)
    expect(email.html).not.toContain('x'.repeat(601))
  })

  it('ships a plain-text alternative', () => {
    const email = feedbackReplyEmail(BRAND, { reply: 'Thanks!', originalMessage: 'Hello' })
    expect(email.text).not.toContain('<')
    expect(email.text).toContain('Thanks!')
  })
})

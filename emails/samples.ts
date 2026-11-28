// Sample data for every email — what `bun run email:dev` and `bun run
// email:preview` fill the templates with, and what test/emails.test.ts renders
// to prove every template compiles, fills in and escapes. One entry per file in
// emails/templates/; the test fails when the two lists disagree.
//
// Plain data, no imports: it runs in Bun (the dev server) and in workerd (the
// test suite), which share nothing else.

export type EmailSample = Record<string, unknown>

const brand = { appName: 'My App', appUrl: 'https://my-app.example' }

export const SAMPLES: Record<string, EmailSample> = {
  'account-deleted': { ...brand, name: 'Ada' },
  'feedback-reply': {
    ...brand,
    reply: 'Fixed in this morning’s release — thanks for the report.',
    quoted: 'The export button does nothing on Safari',
  },
  invite: {
    ...brand,
    inviterName: 'Ada Lovelace',
    url: `${brand.appUrl}/invite/3q2-8wZk1fYb7Jm4Xc9RtLpNv6HsQeUa0DgKoIiTyBw`,
    expiresDays: 30,
  },
  'mantel-invite': {
    ...brand,
    inviterName: 'Ada Lovelace',
    url: `${brand.appUrl}/invite/3q2-8wZk1fYb7Jm4Xc9RtLpNv6HsQeUa0DgKoIiTyBw`,
    expiresDays: 30,
    mantelName: 'Leo',
  },
  'news-invite': {
    ...brand,
    inviterName: 'Ada Lovelace',
    url: `${brand.appUrl}/invite/3q2-8wZk1fYb7Jm4Xc9RtLpNv6HsQeUa0DgKoIiTyBw`,
    expiresDays: 30,
    mantelName: 'Leo',
  },
  'family-invite': {
    ...brand,
    inviterName: 'Ada Lovelace',
    familyName: 'The Lovelaces',
    url: `${brand.appUrl}/invite/3q2-8wZk1fYb7Jm4Xc9RtLpNv6HsQeUa0DgKoIiTyBw`,
    expiresDays: 30,
  },
  'mail-arrived': { ...brand },
  'mantel-recovery': {
    ...brand,
    mantelName: 'Leo',
    readyDate: 'December 16, 2026',
    url: `${brand.appUrl}/mantels/4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11`,
  },
  'mantel-handover': {
    ...brand,
    mantelName: 'Leo',
    url: `${brand.appUrl}/mantels`,
  },
  'mantel-handover-named': {
    ...brand,
    mantelName: 'Leo',
    keeperName: 'Ada Lovelace',
    email: 'leo@example.com',
    handoverDate: 'June 14, 2044',
    url: `${brand.appUrl}/mantels/4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11`,
  },
  'mantel-handover-due': {
    ...brand,
    mantelName: 'Leo',
    url: `${brand.appUrl}/mantels/4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11`,
  },
  'mantel-closed': {
    ...brand,
    mantelName: 'Leo',
    url: `${brand.appUrl}/people`,
  },
  'mantel-closed-keepers': {
    ...brand,
    mantelName: 'Leo',
    url: `${brand.appUrl}/mantels/4b0f6c1e-0d3a-4c1f-9e57-1f2f6b6f0a11`,
  },
  'magic-link': {
    ...brand,
    url: `${brand.appUrl}/auth/confirm?token=2f9c1d`,
    expiresMinutes: 15,
  },
  note: {
    ...brand,
    heading: 'Exports are here',
    paragraphs: [
      'You can now export everything in your account as a single file.',
      'It is on your account page, under Your data.',
    ],
    button: { label: 'See what changed', url: `${brand.appUrl}/changelog` },
    footnote: 'You’re receiving this because you have an account at My App.',
  },
  'password-reset': {
    ...brand,
    url: `${brand.appUrl}/auth/reset#token=8a1b3c`,
    expiresMinutes: 30,
  },
  'subscribe-confirm': {
    ...brand,
    url: `${brand.appUrl}/updates/confirm#t=9e2f`,
    days: 7,
  },
  'verify-email': {
    ...brand,
    url: `${brand.appUrl}/auth/verify-email#token=5d7e9f`,
    expiresMinutes: 60,
  },
}

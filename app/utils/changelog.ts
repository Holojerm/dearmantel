// The changelog, as data. Rendered by app/pages/changelog.vue.
//
// ── Why this page exists ─────────────────────────────────────────────────────
// It closes the only loop the app was missing. Feedback came in, issues got
// filed, fixes shipped — and the person who reported the thing never found out.
// A public changelog is the cheapest way to tell everyone at once, and the
// reply endpoint (POST /api/feedback/[id]/reply) is how you tell one person.
//
// Newest first, one entry per day something shipped, written from the merged
// pull requests. Keep entries short and in the product's voice (DESIGN.md ›
// Voice): what a person can now do, never how it was built.

import { formatLongDate } from './dates'

export type ChangeKind = 'added' | 'improved' | 'fixed'

export interface ChangelogEntry {
  /** ISO date, `YYYY-MM-DD`. Rendered as the entry's heading. */
  date: string
  /** Optional version or release name, shown as a badge when present. */
  version?: string
  changes: { kind: ChangeKind; text: string }[]
}

/** Badge colour per kind. Semantic tokens only — no raw palette values. */
export const CHANGE_KIND_COLOR: Record<ChangeKind, 'success' | 'info' | 'warning'> = {
  added: 'success',
  improved: 'info',
  fixed: 'warning',
}

/** Dear Mantel's history, newest first, one entry per day something shipped. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-24',
    changes: [
      {
        kind: 'added',
        text: "A child's mantel is handed over to the child on its day. Its letters become theirs, and its keepers no longer hold its key.",
      },
      {
        kind: 'added',
        text: 'Keepers can close a mantel they keep, by a vote of more than half of them. Nobody writes to it afterwards, and its letters stay where they are.',
      },
      {
        kind: 'fixed',
        text: 'A keeper who is removed from a mantel can no longer write to it, and a page runs no script it was not sent with.',
      },
    ],
  },
  {
    date: '2026-11-23',
    changes: [
      {
        kind: 'added',
        text: "A keeper can replace a mantel's recovery code without changing its key.",
      },
      {
        kind: 'added',
        text: "A mantel's only keeper can delete their account once they confirm its recovery code, so the letters are never left with no way in.",
      },
      {
        kind: 'improved',
        text: "A letter from a child's mantel that could not arrive comes back to the mantel, and a keeper's copy holds the letters the child wrote as well as those they received.",
      },
    ],
  },
  {
    date: '2026-11-22',
    changes: [
      {
        kind: 'improved',
        text: 'The terms and the privacy page name Holojerm LLC, which runs Dear Mantel.',
      },
    ],
  },
  {
    date: '2026-11-20',
    changes: [
      {
        kind: 'added',
        text: 'Sign up with Face ID or Touch ID, with nothing to remember. The other way in is offered once, later.',
      },
      {
        kind: 'added',
        text: "A child's mantel writes back: a keeper writes as the child to the people who write to them.",
      },
      {
        kind: 'added',
        text: "Keepers choose how letters to a child's mantel open: on arrival, sealed until days they name, or both.",
      },
      { kind: 'fixed', text: 'A letter can be sealed to more than ten readers.' },
      { kind: 'fixed', text: 'The city list has every place of more than 5,000 people.' },
    ],
  },
  {
    date: '2026-11-18',
    changes: [
      {
        kind: 'added',
        text: 'Dear Mantel can be added to a phone\'s home screen and say "Something arrived on your mantel" there. That is off until you turn it on in Your post.',
      },
    ],
  },
  {
    date: '2026-11-17',
    changes: [
      {
        kind: 'improved',
        text: 'Fewer steps between an invitation and a first letter. Creating an account to accept is the yes, and it leads straight to a sheet of paper.',
      },
      {
        kind: 'added',
        text: 'When a keeper leaves a mantel, the keepers who stay are asked to change its key, so whoever left cannot open what comes after.',
      },
      {
        kind: 'fixed',
        text: "A guest's write link carries a secret in its last part, so the address alone is not enough to write.",
      },
      {
        kind: 'improved',
        text: 'The welcome email says what someone starting out needs to know: keep the password and the recovery code, and letters take days.',
      },
    ],
  },
  {
    date: '2026-11-16',
    changes: [
      {
        kind: 'added',
        text: "News of a child: a child's keepers write to the people they invite, who read it on their own mantel.",
      },
      {
        kind: 'added',
        text: 'The family room: a photo album for each family, where everyone says they are, and a map of their cities. It is not encrypted, and every page in it says so.',
      },
      {
        kind: 'added',
        text: 'The gazette and the almanac: each finished month and year of a family room, laid out to read.',
      },
      {
        kind: 'added',
        text: "Families: one letter to several readers, each copy carried on its reader's own post.",
      },
      {
        kind: 'added',
        text: "Child's and anniversary mantels, each kept by more than one person. Letters to them can be sealed until a day, and any change to who keeps one needs more than half of its keepers.",
      },
      {
        kind: 'added',
        text: 'Keepers invite other people to write to a mantel they keep, and can stop a writer.',
      },
      {
        kind: 'added',
        text: 'Anniversary letters: wedding guests write to the couple from a link, with no account, and the letters open on the first anniversary.',
      },
      {
        kind: 'added',
        text: 'Keep a copy of your letters, of a mantel you keep, or of a family room, made on your own device.',
      },
      {
        kind: 'added',
        text: "A mantel's recovery code can be used: a keeper gets back in at once, anyone else after 30 days in which every keeper can say no.",
      },
      {
        kind: 'improved',
        text: 'Dear Mantel has its own design: paper, clay and ink, one navigation, and a few small drawings that move.',
      },
      { kind: 'improved', text: 'Lines in a letter can be set to the centre or the right.' },
      {
        kind: 'fixed',
        text: 'The findings of an outside penetration test, which found nothing critical or high.',
      },
      { kind: 'fixed', text: 'Signing up no longer stops in Safari Private Browsing.' },
    ],
  },
  {
    date: '2026-11-15',
    changes: [
      {
        kind: 'added',
        text: 'Letters between two people, on a postal rhythm. A sealed letter is collected at 5 pm and arrives days later, never on a Sunday.',
      },
      {
        kind: 'added',
        text: 'Letters and their photos are encrypted in your browser. Dear Mantel cannot read them.',
      },
      {
        kind: 'added',
        text: 'Invitations by email. The email names you and carries no letter and no note.',
      },
      {
        kind: 'added',
        text: 'Your mantel, where letters stand once they arrive, and replies written below the letter they answer.',
      },
      {
        kind: 'added',
        text: 'One email when something arrives: "Something arrived on your mantel." No sender, no count.',
      },
      {
        kind: 'added',
        text: 'Sign in with a password or a passkey, with a recovery code that only you hold.',
      },
      {
        kind: 'added',
        text: 'Rich text and six faces to write in, and one photo per letter.',
      },
      {
        kind: 'added',
        text: 'Choose your mail days and the hour letters arrive. Either person can close a correspondence at any time.',
      },
    ],
  },
]

/**
 * `2026-11-15` → `15 November 2026`. Fixed locale so SSR and client agree.
 *
 * The implementation moved to app/utils/dates.ts when the blog needed the same
 * UTC handling; the name stays because it reads better at the call site.
 */
export function formatChangelogDate(iso: string): string {
  return formatLongDate(iso)
}

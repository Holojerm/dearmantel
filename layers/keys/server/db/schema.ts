import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
}

// One key pair per person. The public half is what letters are sealed to; it
// is set once and never replaced, because every letter already sealed to it
// would become unreadable.
export const userKeys = sqliteTable('user_keys', {
  userId: text('user_id').primaryKey(),
  // SPKI, base64url.
  publicKey: text('public_key').notNull(),
  // Version of the key and wrap scheme (layers/keys/app/utils/key-crypto.ts).
  scheme: integer('scheme').notNull().default(1),
  ...timestamps,
})

// The private half, encrypted in the browser under a secret the server never
// holds: the password's unlock key, one passkey's PRF output, or the recovery
// code. One row per secret. `credentialId` is '' except on a passkey's wrap.
export const keyWraps = sqliteTable(
  'key_wraps',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    credentialId: text('credential_id').notNull().default(''),
    wrapped: text('wrapped').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('key_wraps_secret_idx').on(table.userId, table.kind, table.credentialId),
    index('key_wraps_user_idx').on(table.userId),
  ],
)

export type UserKey = typeof userKeys.$inferSelect
export type KeyWrap = typeof keyWraps.$inferSelect

// A mantel that is not one person's: a child's, or a couple's anniversary
// letters. It has its own key pair, made in a keeper's browser. Only the
// public half is here. Where and when its mail arrives, and what is sealed,
// belong to the letters and post layers.
export const mantels = sqliteTable('mantels', {
  id: text('id').primaryKey(),
  // 'child' or 'anniversary'.
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  // SPKI, base64url. Letters are sealed to it. It changes only when the
  // mantel is re-keyed (server/utils/rekey.ts), in one transaction with every
  // letter key held for the mantel being wrapped again to the new key.
  publicKey: text('public_key').notNull(),
  // Counts re-keys. A browser says which version it worked from, so a copy
  // of an earlier key is never stored as the current one.
  keyVersion: integer('key_version').notNull().default(1),
  // Set when a keeper stops keeping the mantel: they may still hold its key,
  // so a keeper who remains is asked to change it. Cleared by the re-key.
  rekeyDueAt: integer('rekey_due_at', { mode: 'timestamp' }),
  scheme: integer('scheme').notNull().default(1),
  createdBy: text('created_by'),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  // SHA-256 (hex) of a value only the recovery code can produce. Whoever
  // presents that value holds the code: it finds the mantel and proves the
  // claim, and a leak of this column gives neither.
  recoveryProofHash: text('recovery_proof_hash'),
  // A child's mantel: 'YYYY-MM-DD' on the mantel's calendar, set when it is
  // opened. From that day the mantel is handed over to the child with no
  // vote, so keepers who never agree cannot hold it back (handover.ts). It
  // changes only by a carried 'handover_date' proposal, and not once it has come.
  handoverOn: text('handover_on'),
  // Set in the one batch that hands the mantel over: from then on it has no
  // key, no keepers and no letters, and `closedAt` is set too.
  handedOverAt: integer('handed_over_at', { mode: 'timestamp' }),
  handedOverTo: text('handed_over_to'),
  ...timestamps,
})

// The people who hold a mantel's key. A row with `leftAt` set is history.
export const mantelKeepers = sqliteTable(
  'mantel_keepers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mantelId: text('mantel_id').notNull(),
    userId: text('user_id').notNull(),
    // 'guardian', 'partner' or 'successor'.
    role: text('role').notNull(),
    addedBy: text('added_by'),
    leftAt: integer('left_at', { mode: 'timestamp' }),
    // Set when another keeper replaced the mantel's recovery code, so this
    // keeper is told once that the code they may have printed is dead.
    recoveryCodeReplacedAt: integer('recovery_code_replaced_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('mantel_keepers_seat_idx').on(table.mantelId, table.userId),
    index('mantel_keepers_user_idx').on(table.userId),
  ],
)

// The mantel's private key, encrypted in a browser: one copy per keeper,
// wrapped to that keeper's account public key, and one under the mantel's
// recovery code (`keeperId` is ''). The server can open none of them.
//
// After a re-key, a keeper who has not opened the mantel since holds two rows
// instead of a 'keeper' one: 'previous', their copy of the key before, and
// 'handover', the new key locked under both their account key and that
// earlier mantel key. Their browser opens it and stores a 'keeper' copy.
export const mantelKeyWraps = sqliteTable(
  'mantel_key_wraps',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mantelId: text('mantel_id').notNull(),
    // 'keeper', 'recovery', 'previous' or 'handover'.
    kind: text('kind').notNull(),
    keeperId: text('keeper_id').notNull().default(''),
    wrapped: text('wrapped').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('mantel_key_wraps_holder_idx').on(table.mantelId, table.kind, table.keeperId),
  ],
)

// A change to who keeps a mantel. It takes effect only when more than half of
// the keepers have voted for it. Adding someone also needs that person's own
// acceptance, and then a keeper's browser to wrap the key to them.
export const mantelProposals = sqliteTable(
  'mantel_proposals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mantelId: text('mantel_id').notNull(),
    // 'add_keeper', 'remove_keeper', 'handover_date' or 'close'.
    kind: text('kind').notNull(),
    // For an addition: the address it was offered to, cleared once it is settled.
    subjectEmail: text('subject_email'),
    // The person joining (set when they accept) or the keeper leaving.
    subjectId: text('subject_id'),
    role: text('role'),
    // For 'handover_date': the day proposed, 'YYYY-MM-DD'.
    handoverOn: text('handover_on'),
    proposedBy: text('proposed_by').notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    // 'done', 'withdrawn', 'declined' or 'expired'. Null while it is open.
    outcome: text('outcome'),
    settledAt: integer('settled_at', { mode: 'timestamp' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('mantel_proposals_mantel_idx').on(table.mantelId),
    index('mantel_proposals_email_idx').on(table.subjectEmail),
  ],
)

export const mantelVotes = sqliteTable(
  'mantel_votes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    proposalId: text('proposal_id').notNull(),
    userId: text('user_id').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('mantel_votes_voter_idx').on(table.proposalId, table.userId)],
)

// The recovery code used by someone who does not keep the mantel. It stands in
// for keepers who cannot answer, so it does not take effect at once: every
// keeper is told, and any of them can cancel it before `readyAt`.
export const mantelRecoveries = sqliteTable(
  'mantel_recoveries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mantelId: text('mantel_id').notNull(),
    claimantId: text('claimant_id').notNull(),
    // The mantel's key, wrapped to the claimant in their own browser.
    wrapped: text('wrapped').notNull(),
    readyAt: integer('ready_at', { mode: 'timestamp' }).notNull(),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
    cancelledBy: text('cancelled_by'),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [index('mantel_recoveries_mantel_idx').on(table.mantelId)],
)

// Handing a child's mantel over to the child (handover.ts, and
// layers/letters/server/utils/handover-letters.ts for the letters). One row a
// mantel. A keeper names the child's address; on the handover day the child
// is invited, accepts from an account with keys, and a keeper's browser wraps
// the mantel's key to them after a fingerprint check. The child's browser
// then wraps every letter key again to their own key, and one batch removes
// the mantel's key, its keepers and every copy at once.
export const mantelHandovers = sqliteTable(
  'mantel_handovers',
  {
    mantelId: text('mantel_id').primaryKey(),
    // The address a keeper named for the child. Cleared once they accept.
    email: text('email'),
    namedBy: text('named_by'),
    // When the invitation went to that address. Unset until the handover day.
    invitedAt: integer('invited_at', { mode: 'timestamp' }),
    // When the keepers were told the day had come.
    keepersToldAt: integer('keepers_told_at', { mode: 'timestamp' }),
    childId: text('child_id'),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    // The mantel's key wrapped to the child's account key in a keeper's
    // browser, and the key version it was wrapped from. Deleted at handover.
    wrapped: text('wrapped'),
    keyVersion: integer('key_version'),
    givenBy: text('given_by'),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [index('mantel_handovers_email_idx').on(table.email)],
)

// Never holds a row. A batch that must not run unless something is still true
// includes an insert here that selects a row only when it is not: the check
// then fails and the whole batch is rolled back (server/utils/batch-guard.ts).
export const batchGuards = sqliteTable('batch_guards', { failed: text('failed') }, (table) => [
  check('batch_guards_never', sql`${table.failed} IS NULL`),
])

export type Mantel = typeof mantels.$inferSelect
export type MantelKeeper = typeof mantelKeepers.$inferSelect
export type MantelProposal = typeof mantelProposals.$inferSelect
export type MantelHandover = typeof mantelHandovers.$inferSelect

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
}

// The name a person's correspondents see, chosen by them. A row means they
// chose it: the account's own name is a guess made from the email address.
export const people = sqliteTable('people', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  ...timestamps,
})

// A pair today; members are their own table so a circle needs no migration.
export const correspondences = sqliteTable('correspondences', {
  id: id(),
  // Either member may close it. Nothing new can be posted afterwards.
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  closedBy: text('closed_by'),
  // Set when the other side is a kept mantel (a child's, a couple's) rather
  // than a person. That mantel is then a member too, under its own id.
  mantelId: text('mantel_id'),
  ...timestamps,
})

export const correspondenceMembers = sqliteTable(
  'correspondence_members',
  {
    id: id(),
    correspondenceId: text('correspondence_id').notNull(),
    userId: text('user_id').notNull(),
    leftAt: integer('left_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('correspondence_members_pair_idx').on(table.correspondenceId, table.userId),
    index('correspondence_members_user_idx').on(table.userId),
  ],
)

// A family: several people who write to all of each other at once. Its
// members are the members of its correspondence, so a letter to the family is
// an ordinary letter with more than one reader. Each reader's copy travels to
// their own city and arrives on their own mail day.
export const families = sqliteTable(
  'families',
  {
    id: id(),
    name: text('name').notNull(),
    // Who invites and removes. If they leave, the longest-standing member does.
    organiserId: text('organiser_id'),
    correspondenceId: text('correspondence_id').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('families_correspondence_idx').on(table.correspondenceId)],
)

// The invitation is the consent to correspond this way. It carries no letter.
export const invites = sqliteTable(
  'invites',
  {
    id: id(),
    inviterId: text('inviter_id').notNull(),
    // Cleared when the invite expires unaccepted: a non-user's address is not kept.
    inviteeEmail: text('invitee_email'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    acceptedBy: text('accepted_by'),
    correspondenceId: text('correspondence_id'),
    // Set when a keeper invites someone to write to a mantel they keep,
    // rather than to themself.
    mantelId: text('mantel_id'),
    // Set when the invitation is to join a family.
    familyId: text('family_id'),
    // With `mantelId`: the invitation is to read the child's news, not to
    // write to the mantel.
    news: integer('news', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('invites_inviter_idx').on(table.inviterId),
    index('invites_expires_idx').on(table.expiresAt),
  ],
)

// News of a child: the one correspondence its keepers write in and the people
// they invited read from. Who reads it is that correspondence's members.
export const mantelNews = sqliteTable('mantel_news', {
  mantelId: text('mantel_id').primaryKey(),
  correspondenceId: text('correspondence_id').notNull().unique(),
  ...timestamps,
})

// How letters to a kept mantel may open, set by any of its keepers: on
// arrival, sealed until one of `days`, or a writer's choice of the two. No row
// means on arrival only. A change applies to letters sealed after it.
export const mantelOpenings = sqliteTable('mantel_openings', {
  mantelId: text('mantel_id').primaryKey(),
  onArrival: integer('on_arrival', { mode: 'boolean' }).notNull().default(true),
  // [{ on: 'YYYY-MM-DD', label }], on the mantel's calendar, earliest first.
  days: text('days', { mode: 'json' }).$type<{ on: string; label: string }[]>().notNull(),
  changedBy: text('changed_by'),
  ...timestamps,
})

// A draft until sealed. Everything a reader would recognise as the letter
// (text, stationery, signature, the photo's id and description) is inside
// `ciphertext`.
export const letters = sqliteTable(
  'letters',
  {
    id: id(),
    correspondenceId: text('correspondence_id').notNull(),
    // Null once the author deletes their account: the letter belongs to its
    // recipient and stays.
    authorId: text('author_id'),
    inReplyTo: text('in_reply_to'),
    sealedAt: integer('sealed_at', { mode: 'timestamp' }),
    // Collected once the clock passes this; recall and edits end then.
    pickupAt: integer('pickup_at', { mode: 'timestamp' }),
    // The sender's calendar day, 'YYYY-MM-DD'.
    postmarkDate: text('postmark_date'),
    // 'YYYY-MM-DD'. A letter to a kept mantel may be sealed until this day:
    // before it, the server serves its text, photo and key to no reader.
    opensOn: text('opens_on'),
    // 'member', or 'guest' for a letter written from a write link without an
    // account. A guest letter has no author row and names its link.
    origin: text('origin').notNull().default('member'),
    guestLinkId: text('guest_link_id'),
    ciphertext: text('ciphertext').notNull(),
    // Where the sealed photo is stored, if there is one. Changes only on a draft.
    photoKey: text('photo_key'),
    // Version of the encryption scheme, so it can change without a guess.
    scheme: integer('scheme').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('letters_correspondence_idx').on(table.correspondenceId),
    index('letters_author_idx').on(table.authorId),
  ],
)

// A write link for an anniversary mantel: the address on a printed card that
// lets a guest write without an account. Replacing it revokes the old one.
export const guestLinks = sqliteTable(
  'guest_links',
  {
    // Random, made in the keeper's browser. The path alone opens nothing.
    id: text('id').primaryKey(),
    // SHA-256 (hex) of the secret in the link's fragment, which every guest
    // request presents. '' matches no secret: a link from before secrets.
    secretHash: text('secret_hash').notNull().default(''),
    mantelId: text('mantel_id').notNull(),
    // The correspondence guest letters are filed under. Its only member is the mantel.
    correspondenceId: text('correspondence_id').notNull(),
    // Both 'YYYY-MM-DD' on the mantel's calendar. Every letter from this link
    // is sealed until `opensOn`; none is accepted after `closesOn`.
    opensOn: text('opens_on').notNull(),
    closesOn: text('closes_on').notNull(),
    maxLetters: integer('max_letters').notNull().default(300),
    createdBy: text('created_by'),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (table) => [index('guest_links_mantel_idx').on(table.mantelId)],
)

// One row per reader: the letter's content key, wrapped to that reader's
// public key. A draft has only its author's row; sealing adds the recipient's.
export const letterKeys = sqliteTable(
  'letter_keys',
  {
    id: id(),
    letterId: text('letter_id').notNull(),
    userId: text('user_id').notNull(),
    wrappedKey: text('wrapped_key').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('letter_keys_reader_idx').on(table.letterId, table.userId),
    index('letter_keys_user_idx').on(table.userId),
  ],
)

// A child's mantel being handed over: each letter key the mantel holds,
// wrapped again in the child's browser to the child's own key. Nothing reads
// these until the last step, which files them as the child's `letter_keys`
// and deletes the mantel's in one batch
// (layers/letters/server/utils/handover-letters.ts). A browser that closes
// halfway picks up from what is here.
export const handoverKeys = sqliteTable(
  'handover_keys',
  {
    id: id(),
    mantelId: text('mantel_id').notNull(),
    letterId: text('letter_id').notNull(),
    wrappedKey: text('wrapped_key').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('handover_keys_letter_idx').on(table.mantelId, table.letterId)],
)

export type Person = typeof people.$inferSelect
export type Correspondence = typeof correspondences.$inferSelect
export type Family = typeof families.$inferSelect
export type Invite = typeof invites.$inferSelect
export type Letter = typeof letters.$inferSelect
export type LetterKey = typeof letterKeys.$inferSelect

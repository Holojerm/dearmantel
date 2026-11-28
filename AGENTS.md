# Project Standards & AI Development Guide

This file defines the coding, design, and product standards for this project.
It is the **index**, deliberately kept small: it loads into every session, so
anything that is not needed on every task lives in [`.claude/docs/`](.claude/docs/)
and is read on demand.

---

## What this is

**Dear Mantel** (dearmantel.com): "Letters for family and friends, slowly." Letters that arrive
on a postal rhythm, so people can write less often without it feeling rude. One product with
several kinds of mantel, all sharing invites, the postal calendar, end-to-end encryption,
notices and print:

| Kind | What it is | State |
| --- | --- | --- |
| Pair | Letters between two friends. The free tier | Built |
| Family mantel | Letters to a whole family, plus an optional family room (photos, check-ins, map, e-ink screen) that is **not** encrypted | Planned |
| Child's mantel | Letters to someone who cannot read yet, sealed until a date, and letters back that a guardian writes as the child; two guardians hold the key until the handover day, when the letters become the child's own | Planned |
| Anniversary letters | Wedding guests write to a couple from a QR card; the letters open on the first anniversary | Planned |

A fork of `Holojerm/nuxt-cf-template`. Licence is FSL-1.1-MIT (see `NOTICE.md`); do not accept
outside contributions. Read the full plan, with every product decision, the designs for the
planned kinds and the build order, before any product work. It lives outside the repo:

- `~/code/dearmantel-plan.md` <!-- refs-check-ignore -->

The product was first called Analog Mail; nothing carries that name any more.

**Brand and naming.**

- "Dear Mantel" is the product: brand, wordmark, app name, page titles, the legal name in terms
  and privacy.
- "mantel", lowercase and possessive, is a person's place for letters: "your mantel", "the
  family mantel", "Leo's mantel opens in 2044".
- Nothing a user sees says "inbox" or "mailbox": pages, emails, errors, alt text. Identifiers in
  code are not user-facing, but new ones say `mantel`.
- The notice reads "Something arrived on your mantel."
- Technical names are `dearmantel`.


**Rules the code must never break.** They are the product, not preferences:

- No delivery confirmation, read receipt, typing indicator or "opened" status reaches anyone
  but the recipient. The sender sees "In transit, arrives Thursday", then only the postmark.
- A recipient sees nothing about a letter before its release.
- The notice says only that mail has arrived: no sender names, no count, no content. Its link
  carries no token and needs a signed-in session.
- Letter text, stationery and photos are end-to-end encrypted. Nothing derived from them goes
  into logs, error reports, analytics, session replay, `ops_events` or the email queue, and
  there is no admin view of letters.
- Sunday is never a postal day. At most one release and one notice per person per local day.
- A letter belongs to its recipient and survives the sender deleting their account.
- Not gamified: no streaks, couriers, tracking maps or nudges to write.

These hold for every kind of mantel. The planned kinds add more, in force from the first line
of code for each:

- Family room data is never mixed into letter data. The room has its own layer, tables and
  storage prefix; no room table refers to a letter, and no letter code reads the room. The room
  is not end-to-end encrypted, and every room page and upload step says so in plain words.
  Letters stay encrypted, within a family too.
- A sealed letter's ciphertext, photo and keys are served to no one before its opening date,
  guardians included. Opening is not post: it is no release and raises no notice.
- The private key of a child's or anniversary mantel exists only as copies wrapped to its
  keepers and to its recovery code. The server never holds it, and there is no escrow.
- A child's mantel belongs to the child. No guardian action or account deletion removes its
  letters. Custody changes (adding or removing a guardian, the seal, handover, closing) need
  more than half of the guardians to agree; no guardian can remove another alone.
- A guest writes without an account only by encrypting in the browser to the mantel's public
  key, checked against the fingerprint in the link's fragment. The guest's name is inside the
  ciphertext.
- Letter text leaves the browser unencrypted for one reason: the reader's own print order,
  after a consent step that names the print partner. The server never writes it to storage,
  logs or a queue in readable form: a print file is staged as ciphertext under a one-time key
  the server does not store. Print providers sit behind the `PrintProvider` interface.
- A screen or any other integration reads at most one boolean per person ("something on your
  mantel"), never content, senders, counts or which mantel. It is off until that person turns
  it on for themself. It goes up at their release and down at their local midnight, and it
  never reacts to opening: the code behind it does not read `opened_at`.
- News of a child is written only by the mantel's current keepers and read only by people a
  keeper invited, one single-use invitation each. A reader cannot write in it or reply to it.
  Who reads it is served to keepers alone: no route, page, email or export tells one reader
  about another. The child's mantel gets a copy only when the letter's writer says so. It is
  never sealed until a day.
- The family map shows people's cities. It never shows a letter or anything in transit. The
  room sends no check-in reminders and has no way for one member to remind another.

**Where product code goes.** Fork-owned layers, never template-owned paths:

| Layer | Holds |
| --- | --- |
| `layers/post` | Calendar, transit, the release task, notices, the `Notifier` interface, the dev clock. Also the two browser helpers every layer may use to hand a person a file made on their device: `layers/post/app/utils/zip.ts` and `layers/post/app/utils/save-file.ts` |
| `layers/letters` | Invites, correspondences, letters, the mantel page, writing desk, stationery, seals |
| `layers/keys` | Account and mantel keys, wrapping, recovery codes, browser crypto |
| `layers/print` (planned) | The `PrintProvider` interface, the first provider, the consent step, order records, book layout |
| `layers/room` | The family room: a family's photo album, and where each person says they are, with a map drawn on the server (`layers/room/server/utils/room-map.ts`), a copy of the room a member builds in their browser (`/room/<family>/keep`), and the gazette and almanac (`layers/room/server/utils/room-issues.ts`): each finished month and year laid out to read, built when it is read and never stored, so a deleted photo or a check-in taken back is in no issue. Not end-to-end encrypted, and every room page says so. Never imports from or joins to `layers/letters`: who is in a family reaches it through `layers/room/server/utils/room-families.ts`, which the letters plugin registers with. Every row and file carries a family id, and every route starts with `requireRoom` |
| `layers/how` | The public explainer pages: `/how` and one page under it for each kind of mantel and each thing they share (the post, who can read what, keys, joining). Words and drawings only: no server code, no data, and no import from the layers it describes. A page is scenes (`HowScene`), each a diagram built from the kit in `layers/how/app/components/How/` and the drawings in `layers/post/app/components/Art/`, moved by the `play-*` scroll utilities in `main.css` (DESIGN.md › Diagrams). The index, the "next" link and the landing page read each page's title from its own `publicPage` (`useHowPages`). Every sentence on these pages restates a product rule: a change to a rule changes its page in the same pull request |
| `layers/credentials`, `layers/feedback` | Vendored from the template (`bun run layers:pull`), pinned in `layers.lock.json` |

Scheduling functions are pure, live in `layers/post/shared/`, and take `now` as an argument;
nothing in scheduling reads the system clock. Keep modules near 150–200 lines.

Server code that needs the current time for a postal decision calls `postNow()`
(`layers/post/server/utils/clock.ts`), never `new Date()`, so the dev clock can move it. The
dev clock is local only: a bar on every page and `/dev/post` (people, next deliveries, the
notice outbox, a button that seeds three people). Its routes end in `.dev.ts` and its page is
added in `$development`, so a production build contains none of it. Keep it that way.

Sign-in is password and passkeys only (`layers/credentials`, vendored; see
`.claude/docs/credentials.md`). Keys (`layers/keys`): each account has one ECDH P-256 key pair,
made in the browser at sign-up. The server stores the public key and the private key only as
wraps under secrets it never holds (the password's unlock key, each passkey's PRF output, the
recovery code). Every unlock path is one function, `layers/keys/app/utils/key-unlock.ts`; change
it there and in its test, not in the composable. A public key is never replaced. The device
keeps the private key in IndexedDB until sign-out. Pages that open letters use
`middleware: ['auth', 'keys']`. Sign-up offers Face ID (a passkey with PRF) before a password:
such an account's first wrap is the passkey's, it has no password until it sets one, and it
cannot remove its last passkey. `SecondWayIn` on the mantel offers the other way in once per
person per device: a password to a Face ID account, Face ID to a password account.

Custodial mantels (`layers/keys`): a child's or anniversary mantel has its own key pair, made
in a keeper's browser (`mantel-crypto.ts`). The server holds the public key and wrapped copies
of the private key: one per keeper, wrapped to that keeper's account key, and one under the
mantel's recovery code. It never holds the key itself, and the key is never kept on a device.
The key changes only by a re-key (below).
Who keeps a mantel changes only through `custody.ts`: a proposal takes effect when more than
half of the keepers have voted (`carries`), so two keepers must both agree. Seating a keeper
also needs that person's acceptance and a wrapped copy from a keeper's browser, which the
server cannot make. A mantel's last keeper can delete their account only after proving they
hold its recovery code (`sole-keeper.ts`: the proof each code derives, checked against the
mantel's hash, passed to the deletion guard as `mantelRecoveryProofs`); the mantel and its
letters stay with no keeper until someone uses the code. The recovery code
(`recovery.ts`) is the one way around the vote: it never reaches the server, which keeps only
the hash of a proof the code derives (`recoveryProof`). A keeper who uses it replaces their
own copy of the key at once. Anyone else waits `RECOVERY_WAIT_DAYS` while every keeper is
emailed (`mantel-recovery`) and any of them can cancel. Do not add a path that writes
`mantel_keepers` or `mantel_key_wraps` outside `custody.ts`, `mantels.ts`, `recovery.ts`,
`recovery-code.ts`, `rekey.ts` and `handover.ts`.

Handing a child's mantel over (`layers/keys/server/utils/handover.ts`, `handover-date.ts`, and
`layers/letters/server/utils/handover-letters.ts` for the letters): `mantels.handoverOn` is set
when the mantel is opened, so the handover needs no vote and keepers who never agree cannot
hold it back; moving the day (or setting it on a mantel opened before there was one) is a
`handover_date` proposal carried like any custody change, refused once the day has come. Any one
keeper names the child's address (`nameChild`), never a keeper's, and every other keeper is
emailed (`mantel-handover-named`). From the day, on the mantel's calendar, the address is
invited (`mantel-handover`, by the daily `mantel-handover` task or at once when named late),
the child accepts from that address with keys, and a keeper's browser wraps the mantel's key to
the child after the fingerprint check (`giveHandoverKey`, guarded on `keyVersion`). The child's
browser wraps every letter key the mantel holds again to their own key (`useHandover`,
`wrapLetterKeysForChild`, which opens each new copy again before it is sent) and stores them in
`handover_keys`, which nothing reads, a batch at a time, so a closed browser resumes. The last
step (`closeHandover`) is one batch that cannot be undone: a guard refuses it while any of the
mantel's letter keys has no copy waiting or the handover is no longer ready, then it files the
copies as the child's `letter_keys`, moves every delivery, letter author and correspondence
membership from the mantel's id to the child's, closes the news, and (`handoverCloseStatements`)
deletes every copy of the mantel's key, ends every keeper, and sets `handedOverAt`,
`handedOverTo` and `closedAt`. Run twice it answers the same. A sealed letter keeps `opensOn`,
and a person's own mantel withholds it until then (`seal-gate.ts`: `listMantel`, `openLetter`,
`readPhoto`, the export's keys). `mantelKeyIs` refuses a closed mantel, so nothing more is filed
under its id.

Closing a kept mantel (`layers/keys/server/utils/close-mantel.ts`, and
`layers/letters/server/utils/mantel-closed.ts` through the `onMantelClosed` seam) is a `close`
proposal carried like any custody change; a mantel's only keeper closes it alone. It ends
writing, not keeping: one batch sets `mantels.closedAt`, withdraws the proposals about who keeps
it, closes every correspondence with the mantel and its news (`closedBy` is the mantel's id),
expires its invitations and revokes its write link; then letters in transit to it go back to
their senders and each writer and each other keeper is emailed (`mantel-closed`,
`mantel-closed-keepers`). Keepers, their copies of the key, the recovery code and every letter
stay. So `closedAt` gates writing and who keeps it, and `handedOverAt` gates what guards the
letters: a closed mantel still recovers (`recovery.ts`), still asks its last keeper for the code
(`sole-keeper.ts`), still re-keys, and a closed child's mantel is still handed over on its day.

A new recovery code without a new key (`recovery-code.ts`, `MantelRecoveryCode` on the
mantel's page): for a printed code that was lost or seen. There is one code a mantel, so the
'recovery' copy and `recoveryProofHash` are replaced in one guarded batch, open claims on the
old code are cancelled, and every other keeper is told once (`recoveryCodeReplacedAt`). It is
refused while a re-key is due, which makes a new code anyway. It cannot take back a key that
already got out; the page says so.

Re-keying a mantel (`rekey.ts`, and `layers/letters/server/utils/kept-rekey.ts` for the letter
keys): a keeper who leaves, by a vote or by deleting their account, may still hold the
mantel's key, so `mantels.rekeyDueAt` is set and the keepers who remain are asked to change it
(`LettersMantelRekey` on the mantel's page). The keepers can also ask for one when nobody has
left, if they think the key got out: a `rekey` proposal (`rekey-vote.ts`, `MantelChangeKey`)
carried like any custody change, which only sets `rekeyDueAt` (a mantel's only keeper carries it
alone); every re-key settles any `rekey` proposal still open. A keeper leaving still asks with no
vote (decision D5). One keeper's browser makes a new key pair and
recovery code and wraps every `letter_keys` row held for the mantel again to the new key
(`useMantelRekey`, `rewrapLetterKeys`). `rekeyMantel` stores all of it in one batch: the new
public key and `keyVersion`, the keeper's copy, the recovery copy and proof, the letter keys,
and the write link revoked (its fragment is a fingerprint of the old key). Each other keeper
gets a `handover` copy locked under both their account key and the mantel's key from before
(`wrapMantelKeyForHandover`), so neither the server nor whoever left can open it; their old
copy becomes `previous`, and `useMantelKeys.open` settles the two into an ordinary copy on
their next visit, after checking the key it opened is the mantel's public key's pair. A keeper
who misses more than one re-key holds a chain: each re-key appends a link to their `handover`
row (`HANDOVER_SEPARATOR`, `openHandoverChain`), so nothing about the letters is lost and no
keeper is shut out. The new recovery code is kept on the re-keying device until its keeper
confirms it (`unconfirmedCode`), because once the batch lands it cannot be made again. Limits,
all deliberate: the server cannot check the wrapped keys it is handed, so the keeper doing a
re-key is trusted with the letters as they already are with the key; the other keepers'
account keys come from the server, so the server together with whoever left could open a
hand-over (neither can alone); and the plan hands a keeper the wrapped keys of letters still
sealed or on their way, which opens nothing but shows that they exist.

A batch that writes something a browser wrapped to a mantel's key must carry a guard
(`batch-guard.ts`): the handler's check and its write are not one step, and a re-key can land
between them. `batchGuard(db, condition)` is a statement that fails, rolling the batch back,
unless the condition holds when it runs; `isGuardFailure` tells that from a fault. Sealing to
a mantel (`sealLetter` takes `readerKeys`, the public key each copy was wrapped to), a guest's
letter, seating a keeper (`grantSeat` takes `keyVersion`) and the recovery code all carry
one. Build guards and other raw statements for a batch with the query builder, not `db.run`:
Drizzle's D1 batch cannot bind a raw statement's values. Pages: `/mantels`
(kept mantels and offered seats), `/mantels/new` (keys made here, recovery code shown once)
and `/mantels/<id>` (keepers, proposals, and the fingerprint check before a keeper's browser
wraps the key to a new one). The person being seated reads their own key's fingerprint from
their screen; the keeper compares it with the one computed from the key the server handed
over, so a key swapped by the server shows as a mismatch.

Letters to a kept mantel (`layers/letters`): the mantel is a postal recipient under its own id.
It has a `postal_profiles` row, it is a member of a correspondence whose `mantelId` is set, and
deliveries and the mantel's `letter_keys` row use that id, so sealing, transit, release and
returns treat it as a person. `recipientIdentity` is the one place that tells the two apart.
The release tells a mantel's keepers through `registerNoticeAudience` (never a notice for the
mantel id). Keepers read through `kept-mantel.ts` only, which holds both gates: nothing before
delivery, and for a letter with `opensOn` nothing (text, photo, key) before that day on the
mantel's calendar, to keepers too. The one other reader of a mantel's `letter_keys` is a
re-key's plan (`kept-rekey.ts`), which hands over wrapped keys and nothing else. Opening is not post: no release, no notice, any weekday. Any
new way to read a mantel's letters (export, print) must go through the same gate. How a letter
to a kept mantel may open is its keepers' choice (`layers/letters/server/utils/openings.ts`): on
arrival, sealed until one of the days they list, or both, and `sealLetter` refuses anything
else; writers never pick a day of their own. Any one keeper changes it, with no vote, because it
applies only to letters sealed afterwards. Keepers write from the mantel's page.

A child's mantel writes back (`layers/letters/server/utils/mantel-author.ts`): a keeper writes
as the mantel, so the letter's `authorId` is the mantel's id and the post treats it as any
letter, collected on the mantel's calendar and carried from its city. Every route that acts on
an author's letter takes an optional `mantelId` and resolves the author with `requireAuthor`;
nothing else may write as a mantel. The author's copy of the key is wrapped in the keeper's
browser to the mantel's key (`useLetterAuthor`, which works the public key out of the opened
private key and refuses a server key that is not its pair), and `saveDraft` guards that key
like any wrap to a mantel. The mantel writes only in correspondences it is already a member of,
never in its news, and only a child's mantel writes. Never call `readPhoto` as the mantel,
which would serve what it received past the seal: `ownPhoto` and `ownLetter` are author-only.
A reply from the mantel may answer only a letter whose day has come (`saveDraft`). A letter
the mantel wrote that comes back is a `return` delivery to the mantel's id; keepers see and open
it on the mantel's page through `kept-mantel.ts`, and a keeper's copy (`kept-archive.ts`) holds
everything the mantel sealed (`kept-sent.ts`), once each. All of it stays keyed by the mantel's
id, which is what handover moves to the child (`closeHandover`). Anyone else writes after a keeper invites them: the same
invitation as between two people, with `invites.mantelId` set, its own email
(`mantel-invite`), and acceptance making a correspondence with the mantel rather than with
the keeper. A writer who is not a keeper reads nothing on the mantel, and no writer sees
another's letters. A mantel's name is printed in that email only when it would pass as a
display name (`mailableMantelName`).

News of a child (`layers/letters/server/utils/news.ts`): each child's mantel can have one
news correspondence (`mantel_news`), named in no other table. Its members are the keepers, whom
`seatKeepers` adds before anything is planned, and the readers, who join by accepting an
invitation with `invites.news` set. `planSeal` and `saveDraft` refuse anyone who is not a
keeper, so a reader's membership is no way to write, and `openLetter` gives news no reply. The
mantel is not a member: `planSeal(…, withChild)` adds it as a reader for one letter, and
`sealLetter` must be passed the same choice the browser wrapped keys for. `listNewsReaders` is
the only place the readers are listed and it is keeper-gated. A reader who stops or is stopped
has their copies in transit deleted (`endReading`), not returned. Keepers manage it from the
mantel's page (`LettersMantelNews`); a reader sees "News you get" on `/people` (`PeopleNews`).

Guest letters (`layers/letters/server/utils/guest-letters.ts`): an anniversary mantel can
have one write link, `/w/<id>#<fingerprint>.<secret>`. The fragment never reaches the server
with the page. Its first part is a fingerprint of the mantel's public key, which the guest's
page checks before it shows a form (`keyFingerprintToken`). Its second is a secret a keeper's
browser derives from the mantel's private key and the link's id (`guestLinkSecret`); the
server stores only its hash, and all three guest routes answer "unknown" without it, so the
path alone opens nothing. A keeper's device shows the address only where it can open the
mantel. A guest letter has no author, `origin` 'guest', no
transit, and is sealed until the link's `opensOn`. The routes under
`/api/letters/guest/` are the only letter routes that work signed out: the two that post sit behind
`requireTurnstile` and rate limits per sender and per link, and the link has a closing day
and a cap. Never add the guest's name, or anything else from inside the letter, to a row.

A new account goes: recovery code (`/welcome/recovery-code`), then one page for a name and a
city (`/welcome`); mail days and the delivery hour start as every weekday at ten and sit behind
"Change". The post owns that page and knows nothing of names: another layer adds what it needs
asked there with `registerWelcomeField` (`layers/post/app/utils/welcome-fields.ts`), as the
letters layer does for the name. The layout shows "Step n of 4" over the four sign-up pages
(`LettersSignUpSteps`). Those guards cover the landing page and letter pages only; account and
security pages must stay reachable without them. Guards that decide in the browser redirect
after hydration, never during it. The city list is GeoNames data loaded by
`bun run cities:import` (add `--remote` for production); it is not a migration.

Notices: the release queues one `notices` row per person per mail day, and `dispatchNotices`
sends them through a `Notifier` (`layers/post/server/notify/`; email is the only one). The notice
email ("Something arrived on your mantel") takes no data but the brand, so it cannot name a
sender or count letters. The same notice also goes as a notification to the devices a person
turned them on in (`pushNotice`, through the vendored `layers/pwa`): once per notice, beside the
email and never instead of it, with the same fixed wording. It is the only push in the product,
and the switch for it is on Your post (`/settings/post`). A send is at
most once; a failed one is retried on later runs, never repeated as a reminder. Resend reports
bounces to `POST /api/webhooks/resend` (404 until `NUXT_POST_RESEND_WEBHOOK_SECRET` is set): a
hard bounce of a notice returns that day's unopened letters to their senders.

Invitations (`layers/letters`): `/people` invites by email and lists correspondents; the link
lands on `/invite/<token>`. The email has fixed wording, names the sender and carries no letter
or note. Only a hash of the token is stored, the address is deleted on acceptance or expiry
(30 days), and the token travels to the API in a request body, never a URL. Whoever holds the
link may accept it once; accepting needs a chosen display name (`people` table) and a city.
Display names go into email to strangers, so `displayNameSchema` refuses anything that reads
as a link or an address: do not loosen it. Sign-up ends on `/people`, which is also where an
invitation opened before sign-up is picked up again. Someone who pressed "accept" before they
had an account has said yes: the invitation is then accepted for them. Finishing sign-up in a
browser that never opened the link loses nothing: `/people` and the mantel list invitations
sent to the account's own address (`GET /api/letters/invites/mine`), accepted by id, which the
server allows only for that address. Accepting leads to the thing accepted (a sheet of paper
for a person or a kept mantel, the room for a family, the mantel for news), with one sentence
said once (`useWelcomeNote`, `<WelcomeNote>`). The invitation page never names the invitee, so
do not pre-fill their address anywhere.

Writing (`layers/letters`): `/write` is the desk for one letter, `/desk` lists drafts and sent
letters. A letter is a `LetterDoc` (rich text, stationery, the signed name) encrypted in the
browser under its own random key; that key is wrapped once per reader to their public key
(`layers/letters/app/utils/letter-crypto.ts`). The server validates the envelope's shape and
stores it. A draft has only its author's key row. Sealing (`sealLetter`) adds the recipient's
key and a delivery whose pickup, postmark and dates are fixed in one transaction; recall
before pickup undoes exactly that. What a sender sees afterwards comes only from
`senderView`: never read `deliveries.state`, `deliveredAt` or `openedAt` on the sender's side.
Times are shown in the sender's profile time zone, not the device's.

Letter text is rich text: the editor's document held to the node and mark list in
`layers/letters/shared/utils/rich-text.ts` (no links, images or HTML). A letter comes from
another person's browser, so it is parsed with `parseLetterDoc` and drawn node by node by
`LetterRichText`: never `v-html`, and never widen the list without widening the renderer and
its test. The editor is NuxtUI's `UEditor` wrapped in `LetterEditor`. Faces and the paper's
type are plain CSS in `layers/letters/app/assets/css/letter.css` (DESIGN.md › Letter faces).

Photos (`layers/letters`): a letter carries at most one. The browser redraws it at 2560 px on
the long edge as a JPEG (which drops the camera's metadata), encrypts it under the letter's
content key (`photo-crypto.ts`, bound to the letter id and to a photo id kept inside the
`LetterDoc`), and uploads the sealed file to R2 at `letters/<letter>/<photo>`. `photos.ts`
holds the rules: only the author changes it, only on a draft, and `readPhoto` serves the
recipient nothing before delivery and never touches `openedAt`. Code that deletes a draft
must delete its file too (`discardDraft`, `removeDraftPhotos`). Photos are shown from
`data:` addresses: the content policy has no `blob:` in `img-src`, on purpose.

Families (`layers/letters/server/utils/families.ts`): a family is a name on a correspondence
with more than two members, so a letter to it is an ordinary letter with several readers.
`planSeal` returns every reader with their own posting; `sealLetter` takes the letter's key
wrapped once per reader and refuses if the readers are not exactly the ones planned
(`readers-changed`). Each reader has their own delivery, on their own post, and reads on their
own mantel; nothing tells one reader about another's copy. The writer's desk shows one letter,
in transit until the last copy's promised day. Only the organiser invites and removes; anyone
may leave. Leaving, removal and account deletion end one member's place and never close the
family (`closeCorrespondence` refuses a family). A new member reads only what is sealed after
they join.

Reading (`layers/letters`): `/mantel` is home (a signed-in visit to `/dashboard` goes there) and
lists what has been delivered; `/letter/<id>` opens one. `listMantel` and `openLetter` return
only deliveries in state `delivered` to the caller, so nothing shows before its release, and
they are the only code that reads `openedAt`. A returned letter arrives as a `return` delivery
to its author. A reply is an ordinary letter with `inReplyTo` set when its draft is first
saved; it can answer only a letter that has arrived for its writer. `LetterNav` is the
product's navigation: the template's layout is not edited.

Settings and leaving: `/settings/post` changes mail days and the hour from tomorrow
(`changeMailSettings` writes a pending change; never write `mailDays` directly) and the city at
once. Closing a correspondence (`closeCorrespondence`) returns letters in transit to whoever
closed it; that person's own posted letters still arrive. Account deletion follows the paper
rule through the letters and post contributors: received letters, drafts, keys and settings
go; sent letters stay with their recipients with `authorId` null. The privacy page's letters
section is `LettersPrivacy`; keep it true when the encryption or what the server stores changes.

The data export (`/api/account/export`) gets its letters, post and keys sections from each
layer's `exportSection`. `exportLetters` obeys the same rules as the screens: received letters
only in state `delivered`, and nothing from `deliveries` on the sender's side. Letter text is
exported as ciphertext; a readable archive is built in the browser and is a later step.

---

## Where things are documented

Read the row that matches what you are about to touch. Do not load them all.

| Doc | Covers | Load it when |
| --- | --- | --- |
| [`.claude/docs/gotchas.md`](.claude/docs/gotchas.md) | Silent failure modes — wrong-file databases, migrations that never run, empty sitemaps, rate limiters that quietly do nothing | Something "works" but produces no output; or you touch D1, migrations, deploy config, cron, `definePageMeta`, or a worktree |
| [`.claude/docs/patterns.md`](.claude/docs/patterns.md) | Worked examples: components, API routes, Drizzle queries, forms, error handling, feedback | Writing a new component, route, form, or query — especially your first change here |
| [`.claude/docs/auth.md`](.claude/docs/auth.md) | Magic link, OAuth, session revocation, `rateLimit()`, Turnstile | Anything under `server/api/auth/`, sessions, rate limiting, or bot protection |
| [`.claude/docs/pwa.md`](.claude/docs/pwa.md) | The vendored pwa layer: the service worker, the offline page, what may and may not be cached, Web Push (`sendPush`, VAPID keys), the install prompt. It can also keep pages for offline reading and queue writes in an outbox (`useOutbox`, `idempotent`); Dear Mantel names no offline route and uses neither, and what may be kept on a device is the owner's decision | Anything that sends a notification, or a page that behaves differently once installed |
| [`.claude/docs/email.md`](.claude/docs/email.md) | Resend, the `EMAIL_QUEUE`, retry/dead-letter, notification decisions | Adding or changing any outbound email |
| [`.claude/docs/seo.md`](.claude/docs/seo.md) | `useSeo()`, `publicPage` meta, structured data | Adding or editing a page |
| [`.claude/docs/brand.md`](.claude/docs/brand.md) | How every icon is generated from one `Logo.vue` | Redesigning the mark or fixing `brand:check` |
| [`.claude/docs/agent-setup.md`](.claude/docs/agent-setup.md) | MCP servers, skills, slash commands, cloud routines | Configuring tooling, or setting up a fork |
| [`.claude/docs/fleet.md`](.claude/docs/fleet.md) | `fleet.json`, `/api/status`, `/api/fleet`, the `ops_events` spool and fleet alerts | Touching the manifest, the status/fleet endpoints, or ops alerting |
| [`DESIGN.md`](DESIGN.md) | The visual design system — source of truth | Writing any UI |

**Three gotchas are load-bearing enough to state here**, because each one fails with
no error at all: local D1 lives in two places and only `.data/db/sqlite.db` is real;
**production D1 is migrated only by the deploy command `bun run deploy:ci`** (run by `deploy.yml` on `main`)
(migrate, then deploy; a manual `bun run deploy` still skips it, so run
`bun run db:migrate:remote` after one); and `bun dev` caches its DB connection, so an external write needs a
restart. The rest are in [`.claude/docs/gotchas.md`](.claude/docs/gotchas.md).

---

## Stack Overview

| Layer        | Technology                 | Notes                                                            |
| ------------ | -------------------------- | ---------------------------------------------------------------- |
| Framework    | **Nuxt 4** (v4.4+)         | Full-stack Vue framework                                         |
| UI Library   | **NuxtUI v4**              | Component library, free & open source                            |
| Styling      | **Tailwind CSS v4**        | Utility-first, via NuxtUI                                        |
| Backend      | **Cloudflare Workers**     | Via NuxtHub + Nitro                                              |
| Database     | **Cloudflare D1** (SQLite) | Via Drizzle ORM — `db` + `schema` auto-imported by NuxtHub       |
| KV Store     | **Cloudflare KV**          | For caching, sessions, config                                    |
| File Storage | **Cloudflare R2**          | `BLOB` binding (browser-encrypted blobs; storage code comes later) |
| Auth         | **nuxt-auth-utils**        | Sealed cookie sessions, OAuth                                    |
| Deployment   | **Wrangler**               | `bun run deploy` → `wrangler deploy` (NuxtHub Admin sunset Feb 2026) |
| CI/CD        | **GitHub Actions (mini)**  | `.github/workflows/deploy.yml`: `gate` runs `bun run ci` on every PR; on `main`, typecheck + build, then `bun run deploy:ci`. Browser suites run in `browser-suites.yml` |
| Linting      | **oxlint**                 | Fast Rust-based linter, config in `.oxlintrc.json`               |
| Formatting   | **oxfmt**                  | Fast Rust-based formatter, config in `.oxfmtrc.json`             |
| Validation   | **Zod**                    | All user input + API I/O                                         |

**Cloudflare account.** The Worker, D1, KV, R2, the email queues, the Turnstile widget, the
dearmantel.com zone (`4fe31632a903335169fa20c9dff98e60`, Email Routing for support@) and its
registration live in the "Holojerm LLC" account, the `account_id` in `wrangler.toml` (moved from
the owner's personal account on 2026-11-28). The owner's login sees both accounts: `cf` needs
`CLOUDFLARE_ACCOUNT_ID` set to that id, and takes the zone id rather than `-z dearmantel.com`.
Workers Builds cannot deploy there (Cloudflare ties the GitHub app installation to the personal
account), so `.github/workflows/deploy.yml` runs the PR gate and deploys on every merge to
`main`, on the mini's runner, with the Holojerm LLC token in the `production` environment.

---


## Directory Structure

```
/
├── app/                    # Frontend (Vue/Nuxt pages, components, composables)
│   ├── app.config.ts       # GENERATED from DESIGN.md — NuxtUI colors + component defaults
│   ├── components/         # Reusable UI components
│   │   ├── Brand/          # Logo.vue — the mark; every icon is generated from it
│   │   └── [Feature]/      # Group by feature, e.g. app/components/Workout/
│   ├── composables/        # Shared stateful logic (useAuth, useWorkout, etc.)
│   ├── layouts/            # Page layouts
│   ├── middleware/         # Route guards — auth.ts (UX only, not security)
│   ├── pages/              # File-based routing
│   ├── types/              # Frontend-only TypeScript types (seo.d.ts augments PageMeta)
│   └── utils/              # Auto-imported client helpers
├── server/                 # Backend (Nitro / Cloudflare Workers)
│   ├── api/                # API routes (file = endpoint)
│   ├── db/
│   │   ├── schema.ts       # Single source of truth for DB schema
│   │   └── migrations/     # Generated by drizzle-kit
│   ├── middleware/         # Server middleware (auth guard + auth-surface rate limit)
│   ├── plugins/            # Nitro plugins (error logging, EMAIL_QUEUE consumer)
│   ├── routes/             # Non-/api Nitro routes (ingest, robots, sitemap, llms.txt)
│   ├── tasks/              # Nitro scheduled tasks — cron wiring in nuxt.config + wrangler.toml
│   └── utils/              # Server utilities (helpers, etc.)
├── shared/                 # Auto-imported in BOTH app/ and server/ (Nuxt 4 `shared/`)
│   ├── types/              # Cross-cutting type augmentation (runtime config)
│   └── utils/              # site.ts (URL identity), schema.ts (JSON-LD builders), fleet-manifest.ts (fleet.json shape)
├── scripts/                # One-off scripts (bun seed, etc.)
├── layers/                 # Features that stand alone: feedback/ (vendored from the template, pinned in
│                           # layers.lock.json). A layer registers with core through
│                           # server/utils/extensions.ts (and its sibling seams), never
│                           # imports another layer, and reads like its own small app
├── public/                 # Static assets — og.png, favicon.svg, apple-touch-icon.png
├── .github/                # Dependabot, deploy.yml (PR gate + deploys), browser-suites.yml (axe/CSP/E2E),
│                           # pick-runner.yml
├── fleet.json              # How this app describes itself to the portfolio dashboard — see bun run fleet:check
├── drizzle.config.ts       # Drizzle Kit config
├── nuxt.config.ts
├── wrangler.toml
├── DESIGN.md               # Visual design system — source of truth, see /design-sync
├── brand.lock.json         # Fingerprint of the generated brand assets — see bun run brand:check
└── AGENTS.md               # ← You are here
```

---


## Coding Standards

### General Rules

- **TypeScript everywhere.** No `.js` files except config files that require it.
- **Strict mode on.** Don't disable TypeScript strict checks to make things compile faster.
- **No `any` types.** Use `unknown` and narrow, or define proper types.
- **Nuxt auto-imports.** Never manually import `ref`, `computed`, `useState`, `useFetch`, etc. — Nuxt auto-imports these.
- **No `console.log` in committed code.** Use `console.warn`/`console.error` for real issues only.

- **Worked examples** — a full `<script setup>` component, a Zod-validated API route,
  Drizzle queries, forms, and error handling — are in
  [`.claude/docs/patterns.md`](.claude/docs/patterns.md). Copy those shapes.

---

## Design Standards

**[DESIGN.md](DESIGN.md) is the source of truth for this app's visual design** — color, type,
space, motion, component behavior. Read it before writing any UI.

`app/assets/css/main.css` and `app/app.config.ts` are *compiled from it* by `/design-sync`;
don't hand-edit them and expect the change to survive. `bun run design:check` (part of
`bun run ci`) fails the build on anything that bypasses the token layer.

The dev-only `/design-system` route renders every token and component state on one page in both
color modes — use it to verify a design change actually landed.

DESIGN.md also fixes the shape of the product and its words, and those bind every page:

- **Four places, one navigation**: Mantel, Desk, People, Room. The shell is
  `app/layouts/default.vue`; the places and the menu are in
  `layers/post/app/components/House/`. A new page belongs to one of the four or to the menu. It
  never adds a navigation of its own.
- **Who can read this**: every page that shows something a person made carries one `<WhoReads>`
  line. Encrypted and not encrypted are said in words, never by an icon or a colour.
- **Voice**: DESIGN.md › Voice lists the words this product uses and the ones it never does
  ("inbox", "unread", "new", "secure"). No counts, badges or nudges anywhere.
### The brand mark

The logo is drawn **once**, in
[`app/components/Brand/Logo.vue`](app/components/Brand/Logo.vue); `bun run brand:generate`
cuts every other file from it, and `bun run brand:check` fails the build when they drift.
Never hand-edit generated files in `public/`. Details and the redesign workflow:
[`.claude/docs/brand.md`](.claude/docs/brand.md).

### Component Usage

- **Use NuxtUI components first.** Before building a custom component, check if `<UButton>`, `<UModal>`, `<UForm>`, `<UTable>`, etc. covers your need.
- **Custom components go in `app/components/[Feature]/`** — never dump everything in `app/components/`.
- **Component names are PascalCase** in templates and files: `WorkoutCard.vue`, `ClientList.vue`.

### Styling Rules

- **Tailwind utility classes only.** No custom CSS files unless for truly global styles.
- **No inline `style` attributes** unless animating dynamic values (e.g. `style="width: ${progress}%"`).
- **Color palette**: Use NuxtUI v4's semantic utilities so light/dark mode works for free. Never hardcode a numbered scale (`text-gray-900`, `bg-slate-50`) or a raw hex — `bun run design:check` fails the build on both.
  - Text: `text-default` (body), `text-muted` (secondary), `text-dimmed` (placeholders), `text-toned` (subtitles), `text-highlighted` (headings), `text-inverted`
  - Background: `bg-default` (page), `bg-muted` (subtle sections), `bg-elevated` (cards, modals), `bg-accented` (hover), `bg-inverted`
  - Border: `border-default`, `border-muted`, `border-accented`, `border-inverted`
  - Semantic colors: `text-primary`, `bg-primary`, `border-primary`, likewise for `secondary`/`success`/`info`/`warning`/`error`/`neutral`
  - There is no `text-foreground`, `bg-background`, or `border-border` in NuxtUI v4 — those are shadcn tokens and resolve to nothing.
- **Spacing**: Use the standard Tailwind scale (4, 8, 12, 16, 24, 32...). Don't invent new sizes.
- **Mobile-first**: All layouts start mobile, expand with `sm:`, `md:`, `lg:` breakpoints.
- **Accessibility**: [DESIGN.md › Accessibility](DESIGN.md) is the contract — AA contrast, a
  visible focus ring on everything focusable, `alt` on every image, `aria-label` on icon-only
  buttons, `min-h-dvh` over `min-h-screen`, and the `bottom-safe`/`right-safe` utilities for
  anything pinned to a viewport edge. `bun run design:check` fails the build on the
  machine-checkable half, and `bun run test:a11y` runs axe in a real browser over every
  public route in both color modes — that one owns contrast ratios, landmark uniqueness,
  and heading order. Despite the name it now runs **two** Playwright projects: the axe
  sweep and `test/csp/` (see Security headers), so it is the browser gate rather than
  just the a11y one.

### Dark Mode

NuxtUI handles dark mode automatically via `UColorModeButton`. Use semantic tokens and it just works.

---


---

## Product Standards

Each of these has a full contract in its own doc — this is the one-line version.

- **Errors** — `<UAlert>`/`useToast()` on the client, `createError({ statusCode })` on the
  server, never a raw error message to a user. → [`patterns.md`](.claude/docs/patterns.md)
- **Forms** — `<UForm>` with a Zod schema, re-validated server-side with the same schema.
  Client validation is never the boundary. → [`patterns.md`](.claude/docs/patterns.md)
- **Auth** — the client middleware is **not** a security boundary; every gated API route
  calls `requireAccess(event)` (or `requireUserSession`) itself. → [`auth.md`](.claude/docs/auth.md)
- **Email** — `sendEmail()` never throws, and enqueues rather than POSTs when
  `EMAIL_QUEUE` exists. → [`email.md`](.claude/docs/email.md)
- **SEO & AEO** — every page calls `useSeo()` exactly once and declares `publicPage`;
  `bun run seo:check` fails the build otherwise. → [`seo.md`](.claude/docs/seo.md)
- **Feedback** — unsolicited via `<FeedbackWidget />`; solicited via PostHog Surveys.
  Feedback text is untrusted input. → [`patterns.md`](.claude/docs/patterns.md)
- **Performance** — server-side `useFetch` for initial loads, `defineAsyncComponent` for
  heavy components. → [`patterns.md`](.claude/docs/patterns.md)
- **Fleet contract** — `fleet.json` describes this app, `GET /api/status` reports build,
  migrations and crons, `GET /api/fleet` reports counters behind a token, and every 5xx
  spools an `ops_events` row; fleet reads them from `/api/fleet` and is the only thing that
  emails alerts.
  → [`fleet.md`](.claude/docs/fleet.md)

---

## Git Workflow

- **`main`** — production branch, auto-deploys via `.github/workflows/deploy.yml`
- **`dev`** — integration branch (optional for larger features)
- **Feature branches**: `feat/workout-builder`, `fix/auth-redirect`, `chore/update-deps`
- **Commit format**: `feat: add workout builder`, `fix: correct auth redirect`, `chore: update deps`
- **PRs require**: `gate` (`.github/workflows/deploy.yml`) and `browser-suites` (`.github/workflows/browser-suites.yml`), enforced by the "main: merge when green" ruleset. Open the PR and stop: Mergify queues it once its own checks pass (again after any push) and merges it once they pass on top of main. Open it as a draft to hold it. Never arm `gh pr merge --auto` or run `gh pr update-branch`: a merge outside the queue resets every speculative check in it

---


## Common Commands

```bash
bun dev               # Dev server at https://<portless-name>.localhost (via portless). In a linked
                      # worktree the host is <worktree-dir>.<portless-name>.localhost — printed on start.
bun dev:app           # Bypass portless and run nuxt dev directly on http://localhost:3000
bun run build         # Build for Cloudflare (always `bun run` — bare `bun build`,
                      # `bun test` and `bun deploy` are Bun built-ins, not these scripts)
bun lint              # Run oxlint
bun lint:fix          # Auto-fix lint issues
bun format            # Format with oxfmt
bun format:check      # Check formatting without writing
bun run design:check  # Fail on UI code that bypasses the DESIGN.md token layer
bun run brand:generate # Rebuild favicon.svg, apple-touch-icon.png and og.png from the brand mark
bun run brand:check   # Fail when those generated files no longer match the mark
bun run seo:check     # Fail on pages that bypass useSeo() or aren't declared public/noindex
bun run fleet:check   # Fail when fleet.json stops matching wrangler.toml (names, binding ids, crons)
bun run crons:check   # Fail when [triggers] crons and nitro.scheduledTasks disagree, or a task has no file
bun run routines:check # Fail when a routine pins a model ID instead of a tier, or .claude/routines/models.json is malformed
bun run routines:models # Compare models.json with the newest model per tier (frontier-terminal's catalog); --write moves them
bun run methods:check # Fail when a get/head/delete server route reads a request body (hangs on Workers)
bun run mcp:check     # The template's MCP listing gate. This app has no mcp/ worker, so it passes with nothing to check
bun run test:a11y     # Playwright/Chromium browser suites: axe over every public route
                      # (light + dark) AND the Content-Security-Policy spec (test/csp/)
bun typecheck         # TypeScript type checking
bun run build:preview # Build with the [env.preview] bindings (CLOUDFLARE_ENV=preview)
bun run deploy:preview # Same, then deploy — creates/updates the my-app-preview Worker
bun db:generate       # Generate Drizzle migration after schema changes
bun db:migrate        # Apply migrations to local D1
bun db:migrate:preview # Apply migrations to the preview D1 — nothing does this for you
bun db:studio         # Open Drizzle Studio (visual DB browser)
bun seed              # Seed dev DB via bun:sqlite (writes to .data/db/sqlite.db)
bun run rename <name> # Rewrite the `my-app` placeholder across wrangler.toml, package.json,
                      # .mcp.json.example and fleet.json — every occurrence, in one go
bun run ci            # Every gate, concurrently (scripts/ci.ts): format (writes; checks in CI), email:build, lint,
                      # design/brand/seo/fleet/crons/routines/methods/mcp, migrations:check (schema.ts vs migrations, expand-only),
                      # typecheck, test, build. deploy.yml's `gate` runs this on every PR (production
                      # builds run typecheck + build only). NO browser suites here (see Gotchas).
                      # CI_SERIAL=1 runs the gates one at a time.
bun run ci:fast       # While iterating: format (writes), the cheap gates + typecheck + tests touched since origin/main, no build
bun run ci:browser    # playwright:install + test:a11y — what GitHub Actions runs
bun run deploy        # Manual deploy to Cloudflare via wrangler (normally unnecessary —
                      # deploy.yml deploys automatically on push to main).
                      # Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env vars
```

Use `bun run ci:fast` while iterating; run the full `bun run ci` once before pushing.

`bun run ci` is the merge gate. It is a gate on finished work, not a precondition for
starting: iterate with `bun run ci:fast`, then run `bun run ci` once when you have something to
merge, and again after any change you think is trivial. It runs every gate even after one fails
and prints only the failures, so fix them all in one pass. If it fails, fix the failure; do not
work around it. Both modes run the formatter in write mode, so formatting never fails a local
run; commit what it rewrote. In CI (`CI` set) it runs `format:check` instead, so an unformatted
commit fails the `gate` check.

---

## AI Development Notes

When I ask you to build features in this project:

1. **Check this file first** to stay aligned with the stack and patterns above.
2. **Use NuxtUI components** — don't build custom components for things NuxtUI already has.
3. **Nuxt auto-imports** mean you never need to import Vue primitives or Nuxt composables.
4. **`db` and `schema` are auto-imported** in server routes by `@nuxthub/core` — never instantiate Drizzle manually.
5. **Server routes go in `server/api/`**, frontend pages in `app/pages/`.
6. **Validate all inputs with Zod** — both on the client (UForm schema) and server (`readValidatedBody`).
7. **Ask before adding new dependencies** — prefer solving problems with what's already installed.
8. **Comments that name a symbol, file, or column are checked** — `bun run mirror:check` resolves every backticked reference, so a rename that leaves a stale pointer fails the build. Keep references accurate, or drop them.

---


---

## Agent tooling

MCP servers, skills, slash commands, and the cloud operations routines are
documented in [`.claude/docs/agent-setup.md`](.claude/docs/agent-setup.md).

**Skills: load the named one (Skill tool) at its moment**, before writing. `DESIGN.md` is the
brief and wins over every design skill, and this file wins over all of them.

| Moment | Load |
| --- | --- |
| Building or changing a page or component | `nuxt-ui`; plus `frontend-design` for a new page or a redesign |
| A form, wizard or other multi-step flow | `state-machine` |
| A view that fetches, submits or saves | `loading-states`, `error-handling-ux`, `feedback-patterns` |
| Interface copy (labels, errors, empty states) | `ux-writing` |
| Landing, pricing or marketing copy | `copywriting` |
| A new public content page, or an SEO fix | `seo-audit` |
| Writing or reviewing `server/` code or `wrangler.toml` | `workers-best-practices` |
| A bug or failing test, before proposing a fix | `systematic-debugging` |
| Before calling UI work done | `design-qa-checklist`, then `web-design-guidelines` on the changed files |
| Proposing or judging a growth bet | `a-b-test-design` (the `growth-review` routine's thresholds win) |
| Writing or fixing a browser test | no skill yet: follow `test/a11y/accessibility.spec.ts` and run `bun run test:a11y` |

Parallel agent worktrees under `.claude/worktrees/<name>` are supported and every gate in
`bun run ci` is scoped to its own checkout. The rules that keep it that way — and the three
things that have broken it — are in
[`.claude/docs/gotchas.md`](.claude/docs/gotchas.md).

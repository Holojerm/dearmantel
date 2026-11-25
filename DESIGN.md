# DESIGN.md

How Dear Mantel looks, reads and is laid out, in the portable [DESIGN.md](https://designmd.app/)
format that coding agents read directly.

**This file is the source of truth.** `app/assets/css/main.css` and `app/app.config.ts` are
*compiled from it*: run `/design-sync` after editing this file, and never hand-edit the two
generated files. `bun run design:check` fails the build when app code goes around the tokens
declared here. The brand mark works the same way one level out (see Brand mark).

> **Scope:** visual design, the shape of the product (what lives where), and the words on the
> screen. Product rules live in `AGENTS.md` and the plan; where this file and a product rule
> disagree, the rule wins and this file is wrong.

---

## What this is a design for

Dear Mantel is letters for family and friends that arrive on a postal rhythm. A letter takes
days. A child's letters wait years. The family has a room for its photos and a monthly gazette.
Letters are end-to-end encrypted; the family room is not, and says so.

Six commitments run through every screen. A change that breaks one is wrong however good it
looks.

| The product promises | So the design |
|---|---|
| **Slowly.** Nobody has to answer quickly. | Shows no counts, badges, dots, streaks or "new" markers. Nothing moves to get attention. One action a screen. |
| **Paper.** A letter is a thing someone made. | Treats the letter as the only object. Everything else is the table it lies on, and stays quiet. |
| **Time said out loud.** The wait is the point. | Names days: "arrives Thursday", "opens 14 June 2044". Never "pending", "processing" or a spinner standing in for a date. |
| **Who can read it.** Private by construction, and honest where it is not. | Says in one plain sentence, on the page, who can read what is on it. Encrypted and not encrypted look different. |
| **A house, not a feed.** People you already know. | Names places, not features: mantel, desk, room. No discovery, no profile pages, no activity. |
| **Kept.** A letter should open in twenty years. | Prefers what lasts: text over effects, system fallbacks for every face, copies people can save. |

---

## Identity

- **Personality:** plain, warm, unhurried, with a twinkle
- **References:** a letter on a kitchen table. reMarkable's light serif headline over a still
  surface; Papier's paper ground and warm ink; Stripe Press's warm dark; Are.na's narrow
  measure; Ente's privacy said once in plain words. See What we looked at.
- **Audience:** families and close friends, a grandparent and a teenager on the same mantel.
  Mostly read on a phone. Some of it will be read eighteen years after it was written.
- **Density:** comfortable and single-column. Generous vertical rhythm, a narrow measure.
- **Motion:** alive at the edges, still at the centre. Things on a shelf lean, a clock keeps
  time, a letter unfolds once. Nothing moves on the words someone wrote. See Play and Motion.
- **Iconography:** Lucide (`i-lucide-*`), bundled locally via `@iconify-json/lucide`. Icons
  belong to navigation and controls. An icon never stands in front of a claim: no lock beside
  "encrypted", no shield, no badge.
- **Color mode:** dual. Light is paper by day and the primary design target. Dark is the same
  table under a lamp: warm, never blue-grey, never pure black.

### Never

- Counts, unread badges, red dots, streaks, "last seen", read receipts, typing indicators,
  or anything else that reports on a person
- Urgency: sale banners, countdowns, "don't miss", star ratings, testimonials, award laurels
- Fake vintage: wax seals, airmail stripes, torn edges, paper-grain images, aged or sepia
  effects. Paper is a colour and a rule, not a costume
- Twee: a mascot that talks, waves or carries the post; animal couriers; rounded "friendly"
  faces; pastel blobs; confetti; emoji as UI. The cat is asleep and stays asleep
- Borrowed dress: another brand's colour blocks, sticker buttons, starbursts or marquees. Our
  readers are mostly adults, and the palette is clay, ink and paper
- Gradients as decoration, glassmorphism, or shadows used for style rather than elevation
- More than one accent colour in a viewport
- Faux-bold headings (the display face ships at weight 400 only: never `font-bold` on it)
- Pure black (`#000`) or pure white (`#fff`) as a surface colour
- Stock photography, or an illustration where a photograph of a real thing belongs

---

## The house

The product is one house. Every page is in one of four places, and the same four are the
whole of the navigation.

| Place | Path | What is there |
|---|---|---|
| **Mantel** | `/mantel` | What has arrived for you. Unopened letters stand on the shelf; opened ones are filed below it. The mantels you keep for someone else are listed here too. |
| **Desk** | `/desk`, `/write` | What you are writing and what you have posted. |
| **People** | `/people`, `/family/<id>` | Who you write with, your families, and invitations. |
| **Room** | `/rooms`, `/room/<family>/…` | A family's shared room: photos, where everyone is, the gazette. |

Explanation is not a place. The pages that say how each part works live at `/how`, are public,
and are reached from the landing page and the footer, never from the four places.

Everything else is upkeep and lives in the menu: **Your post** (mail days, hour, city),
**Mantels you keep**, **Keep a copy**, **Account**, light or dark, **Sign out**.

### Navigation

- **One navigation.** The four places, in that order, with those names. A page never carries
  a second row of the same links.
- **From `sm` up** the places sit inline in the header. **Below `sm`** they are a bar pinned
  to the bottom of the screen, a word under each icon, because that is where a thumb is.
- **The menu** is one button at the right of the header at every width. Signed out, the
  header holds the mark and "Sign in", and nothing else.
- **A place may have parts.** The room has three (Photos, Where everyone is, Gazette). Parts
  are a row of text links under the page title, never a second bar.
- **Writing is quiet.** On `/write` and the guest's writing page the phone bar is hidden:
  the page is the paper, and the keyboard needs the room.
- **The mark goes home:** to the mantel when signed in, to the landing page when not.
- **The footer is one quiet line** on every page: how it works, legal links, support, feedback. No floating
  buttons: nothing sits on top of what someone is reading.
- Never let the header wrap to two lines or scroll sideways.

### Page shape

- One column. `max-w-2xl` where something is read or written (a letter, the gazette, legal
  pages), `max-w-xl` for lists and forms, `max-w-3xl` for the room's photo grid.
- The page title is the first thing in `main`: one `h1` in the display face, then at most one
  sentence saying what the place is for.
- One primary button per view. Everything else is outline, ghost or a link.

---

## Voice

The words are part of the design. Most of what makes this product feel slow is how it talks.

- **Say what happens, and when.** "It will be collected on Monday at 5:00 PM and arrives
  Thursday." Not "Your letter is on its way!"
- **Short declarative sentences.** No exclamation marks. No "we're excited", "oops", "hooray".
  No second-guessing the reader's feelings.
- **Name the limit.** "We send one email with your name and a link. It carries no letter and
  no note." People trust a product that says what it will not do.
- **Say who sees it** wherever something is shared (see Who can read this).
- **Buttons are verbs with their object:** "Seal the letter", "Save days and hour", "Leave
  The Lees". Never "Submit", "OK", "Continue" on its own.
- **Empty states are one plain sentence** and at most one action: "Nothing has arrived yet."
  They never coax ("Why not write to someone?").
- **Errors say what to do next** in the same voice: "That did not work. Try again."

### Words we use

| Say | Never |
|---|---|
| mantel ("your mantel", "Leo's mantel") | inbox, mailbox, feed |
| letter | message, post, note, DM |
| seal, post, collected, postmarked, arrives | send, deliver instantly, sent ✓ |
| unopened | unread, new |
| people you write with | friends list, contacts, followers |
| family, family room | group, team, workspace, channel |
| keeper (of a child's mantel) | admin, owner, manager |
| news of Leo; the people who get it | newsletter, updates, feed, subscribers, followers |
| encrypted / not encrypted | secure, safe, protected, military-grade |
| keep a copy | export, download your data, backup |

"Sealed" means posted and final, or held until a date. It is never used to mean encrypted.

### Time

- A day is written as the reader's locale writes it, always with its weekday when it is
  within a week or two: "Thursday 19 November". A date years away always carries its year:
  "14 June 2044". Never a relative time ("in 3 days", "2h ago") and never a bare timestamp.
- An hour is only shown where the post has one: pickup at 5 pm, delivery at the hour chosen.
- A postmark is set in the mono face, small and uppercase. It is the one place a date is
  styled, because it is the one date that is stamped on something.

---

## Who can read this

Every page that shows something a person made says who can read it, in one sentence, set the
same way everywhere: a small uppercase label in the mono face, then plain words.

| Label | Used for | Reads like |
|---|---|---|
| `Encrypted` | A letter, a draft, a kept mantel | "Encrypted. Only you and Ann can read this letter." |
| `Not encrypted` | The family room and everything in it | "Not encrypted. Everyone in The Lees sees this room, and we could read it. Your letters stay encrypted." |

- It is the `<WhoReads>` component. Do not restyle it per page, and do not replace it with an
  icon, a badge or a tooltip.
- It appears once on a page, near what it describes, at `text-sm`.
- The not-encrypted line is never softened, shortened to a label alone, or hidden after a
  first visit. It is a line of text, not an alert box: the fact is permanent, so it should not
  look like a warning that will go away.
- The two labels are told apart by their words. Colour never carries it.

---

## Play

The product should feel like a house someone lives in, not a form someone fills in. Play is
how: small drawings, things that move a little, and a few surprises that reward looking.

**Play lives at the edges and never at the centre.** The centre is whatever someone wrote or is
writing: a letter, a caption, a field. Nothing there moves, decorates or jokes. Around it, the
house is alive.

### The drawings

Every drawing is printed in **two inks on paper**: clay and black. That is the whole palette,
and it is what keeps them ours.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--line` | `stone-800` | `stone-300` | The pen line, 1.5 units wide, round joins |
| `--art-clay` | `clay-500` | `clay-400` | The solid ink: a pot, a postbox, the cat |
| `--art-blush` | `clay-200` | `clay-900` | The same ink printed light |
| `--art-paper` | sheet | sheet | Unprinted paper |
| `--art-kraft`, `--art-cream` | the letter papers | the letter papers | A second paper stock |

- Flat fills and one pen line. No gradients, shading, texture or perspective.
- Objects of the house only: things that could stand on a mantel or a desk. No people, no
  faces, no scenery.
- They are components in `layers/post/app/components/Art/`, drawn as inline SVG so they take
  the colour mode and cost no request. Each is `aria-hidden`: a drawing never carries meaning
  that words on the page do not.

| Drawing | Where | What it does |
|---|---|---|
| **Clock** | The mantel, the landing page | Tells the real time where the reader is. Its pendulum swings. |
| **Candle** | The mantel | Lit only in dark mode: the lamps are on. |
| **Plant** | The mantel | Its leaves move as if a window were open. |
| **Cat** | The mantel when nothing is unopened; the error page | Asleep. Breathes; its tail flicks every six seconds. It carries nothing, says nothing and never wakes. |
| **Stamp** | Every envelope | One of eight designs on one of three papers, at a slight tilt, worked out from the letter's id. Nothing is stored, and stamps are never counted or collected. |
| **Postbox** | The desk, the send-off | Wiggles when a letter goes in. |
| **Envelope** | The landing page, the send-off | Rides the rail down the page; takes its stamp. |
| **Squiggle** | Under one word of the landing headline | Draws itself once. |
| **Key** | The explainer pages | What opens letters. Printed in clay for a person's key, kraft for a mantel's. |
| **Sheet** | The explainer pages | A letter three ways: written, as the server holds it (blocks where the lines were), and a printed recovery code. |
| **Card** | The explainer pages | The card on a wedding table, with its square code. |
| **Print** | The explainer pages | A photo from the family room. |
| **Leaf** | The explainer pages | A calendar leaf showing the day a sealed letter opens. The words beside it say the same date. |

### The little things

- The clock is right. The candle knows it is dark.
- An unopened envelope leans on the shelf, each at its own pace, and lifts when reached for.
- A letter unfolds once when it is opened.
- Sealing a letter ends with its stamp landing and the letter going into the postbox.
- The place you are in hops as you arrive.
- Room photos lie like prints, none quite straight; one straightens when reached for.
- A pin lands on the map once. It never pulses: it is where someone said they are.
- The who-can-read label is set like a rubber stamp, not quite straight.
- Selected text is highlighted in blush.
- A missing page says "Nothing was ever posted here", beside the postbox and the cat.

### Diagrams

The explainer pages (`/how` and the pages under it, in `layers/how`) explain with drawings.
A diagram is made of the house's own objects and follows every rule above, plus these:

- **A person is drawn as their mantel**: a short shelf with one thing standing on it, and
  their name under it. Never a figure, a face or an avatar.
- **A place is a dashed box with its name over it**: "Your browser", "Our server". What is
  inside the line is there and nowhere else, which is how a diagram says what we do not hold.
- **Labels are set like postmarks** and never move. Only drawings move.
- **The words say everything.** A diagram is hidden from assistive technology, and the prose
  under it states each thing it shows. A page read with its diagrams removed is complete.
- **Scrolling is the days going by** (see Motion › A diagram keeps pace). A diagram at rest is
  the finished picture: the letter arrived, every day inked in.
- Encrypted and not encrypted are still told apart by words, in a diagram too. A key is drawn
  where a key is the subject; it never stands beside a claim as a badge.

A new little thing has to pass three tests: it is true to the house (a clock, not a rocket),
it never delays or covers what someone came to do, and the page is complete without it.

---

## Brand mark

An envelope standing on a mantel: the shelf solid, the envelope lighter, its flap solid again.
Three flat shapes, so it stays legible at the size of a browser tab. Not a letterform: the
product's place for letters is the mantel, and the mark is that place with something on it.

**The mark lives in `app/components/Brand/Logo.vue`, and nowhere else.** Every standalone
file is derived from that component by `bun run brand:generate`:

| Generated file | Size | What it is |
|---|---|---|
| `public/favicon.svg` | 32 grid | The browser tab. Carries its own ground — a transparent mark vanishes against a dark tab strip. |
| `public/apple-touch-icon.png` | 180×180 | iOS home screen. Full-bleed: iOS applies its own corner mask, so baking one in double-rounds it. |
| `public/icon-192.png` | 192×192 | Android/desktop "Add to Home Screen", via `manifest.webmanifest`. Maskable-safe: the mark's bounding square covers 56% of the icon — bounding a *square* inside Android's 80%-diameter safe-zone *circle* takes a smaller number than the circle itself, not the same one (`MASKABLE_COVERAGE` in `scripts/generate-brand-assets.ts`). |
| `public/icon-512.png` | 512×512 | Same treatment, larger — the splash-screen source in `manifest.webmanifest`. |
| `public/og.png` | 1200×630 | Every link preview of this site — mark, app name, one sentence. |
| `shared/utils/brand-colors.generated.ts` | — | `theme_color`/`background_color` for `manifest.webmanifest`, resolved from the Color roles table below — a manifest has no color mode either. |
| `public/email-logo.png` | 64×64 | The header of every transactional email, referenced by absolute URL. PNG because Gmail drops SVG; transparent so it sits on the card. |
| `emails/theme.generated.css` | — | The Tailwind theme `bun run email:build` compiles emails with — the `email-*` roles below as hex, plus the font stacks. Email clients do not support CSS variables. |

`bun run brand:check` (part of `bun run ci`) fails the build when those files no longer match
the component. A favicon a redesign behind the app is the normal outcome otherwise; nothing
about it ever throws.

### Construction

- **Grid:** 32×32 viewBox, geometry on whole and half units only.
- **Optical box:** the glyph spans 3→29 across and 7→25 down, so it is centred with room to
  breathe once an icon square is drawn around it.
- **Corners:** `rx 1.5` — slab corners that echo `--ui-radius`. Never a pill.
- **Fill:** `currentColor`, one flat fill plus a single opacity step. No stroke, no gradient,
  no second hue.
- **Minimum size:** 16px. A mark that stops reading at favicon size is a different mark.
- **Clear space:** half the mark's height on every side. In the lockup that is the `gap-2`
  between glyph and wordmark.

### Color roles

A PNG has no color mode, so each role below resolves to a concrete ramp token rather than a
`--ui-*` alias — the aliases flip between light and dark, and a file has to pick one.

| Role | Token | Where it lands |
|---|---|---|
| `icon-ink` | `--color-clay-50` | The glyph inside the app icon |
| `icon-ground` | `--color-clay-600` | The square behind it |
| `og-mark` | `--color-clay-600` | The mark on the share image |
| `og-ground` | `--color-stone-50` | Share image background |
| `og-ink` | `--color-stone-900` | Share image title |
| `og-muted` | `--color-stone-500` | Share image description and footer |
| `manifest-theme` | `--color-clay-600` | `theme_color` in `manifest.webmanifest` — the browser UI tint once installed |
| `manifest-ground` | `--color-stone-50` | `background_color` in `manifest.webmanifest` — the splash screen before the app paints |
| `email-page` | `--color-stone-100` | Email background behind the card |
| `email-card` | `--color-stone-50` | The card itself. Not white: pure white is on the Never list for surfaces, and an email is a surface |
| `email-rule` | `--color-stone-200` | Card border, the rule above a footnote, and row separators |
| `email-ink` | `--color-stone-900` | Email headings, and the secondary button |
| `email-body` | `--color-stone-800` | Email body copy |
| `email-muted` | `--color-stone-500` | Email captions, footnotes, timestamps, the outside-the-card footer link |
| `email-accent` | `--color-clay-600` | Email primary button, and the mark in `public/email-logo.png` |
| `email-on-accent` | `--color-white` | Text on an email button |
| `email-bad` | `--color-rose-700` | Ops alert tone for failures (`error`, white-on-solid 6.03) |
| `email-warn` | `--color-amber-800` | Ops alert tone for anything unclassified (`warning`, 7.09) |
| `email-good` | `--color-emerald-700` | Ops alert tone for recoveries (`success`, 5.36) |

In-app the mark takes `text-primary` and inherits the color mode for free. These roles exist
only for the files that can't — a PNG, a JSON manifest, and email, which has neither a color
mode nor CSS variables. The `email-*` rows follow the semantic assignments in Color: tones use
the same shades the app does, so a failure reads as `error` in the inbox too.

### Never

- A second mark. If a surface seems to need a different logo, the logo is wrong.
- Effects: shadow, gradient, outline, rotation, or animation on the mark.
- The wordmark in anything but the display face at weight 400 (DESIGN.md › Typography).
- Hand-editing anything in `public/` — or `shared/utils/brand-colors.generated.ts` — that
  this pipeline generates.

---

## Color

### Primary ramp — `clay`

A warm brick red, the colour of the mark. It is the only accent: the one primary action on a
screen, a link, and the flap of an unopened letter.

| Shade | Hex | Shade | Hex |
|---|---|---|---|
| 50 | `#fdf5f3` | 500 | `#db6a4b` |
| 100 | `#fbe8e3` | 600 | `#c74f2f` |
| 200 | `#f8d5cb` | 700 | `#a63e24` |
| 300 | `#f2b8a7` | 800 | `#883622` |
| 400 | `#e88f75` | 900 | `#713122` |
| | | 950 | `#3d160d` |

### Semantic assignments

| Role | Color | Use |
|---|---|---|
| `primary` | `clay` | The primary action, links, focus rings, an unopened letter |
| `secondary` | `stone` | Secondary actions. Deliberately not a second hue |
| `neutral` | `stone` | Ink and rules |
| `success` | `emerald` | Confirmations |
| `info` | `sky` | Neutral notices |
| `warning` | `amber` | Reversible risk |
| `error` | `rose` | Failure, destructive actions |

Status colours are for status. A page with nothing wrong on it shows clay and ink only.

### Surfaces — paper

The page is not white. It is the colour of the table, and paper lying on it is lighter.

| Name | Light | Dark | Token | What it is |
|---|---|---|---|---|
| **ground** | `#f6f2ea` | `stone-900` | `bg-default` | The table. Every page. |
| **sheet** | `#fdfbf6` | `stone-800` | `bg-elevated` | A piece of paper: a letter, an envelope, a card, a dialog, a menu. |
| **well** | `#efe9de` | `#23201d` | `bg-muted` | Set into the table: a banded section, a quiet panel. |
| **pressed** | `#e6dfd2` | `stone-700` | `bg-accented` | Hover and pressed states on a surface. |
| **rule** | `#ded6c7` | `stone-800` | `border-default` | Hairlines and the edge of a sheet. |
| **strong rule** | `#cfc6b4` | `stone-700` | `border-accented` | The edge of a field or an outline button. |
| **shelf** | `stone-900` | `#fff` | `bg-inverted` | The mantel's shelf, and nothing else. |

A sheet is told from the ground by being lighter and by its one-pixel rule. It never has a
shadow: paper on a table does not float.

### Ink

| Intent | Token | Light | Dark |
|---|---|---|---|
| Headings, a letter's black ink | `text-highlighted` | `stone-900` | `#fff` |
| Body copy | `text-default` | `stone-800` | `stone-200` |
| Emphasised secondary | `text-toned` | `stone-700` | `stone-300` |
| Secondary, captions, hints | `text-muted` | `stone-600` | `stone-400` |
| Placeholders, disabled | `text-dimmed` | `stone-500` | `stone-500` |

Ink runs one step darker than NuxtUI's defaults in light mode because the ground is tinted:
`stone-500` on the ground is 4.30:1, under AA. `stone-600` is 6.83:1 on the ground and 6.31:1
in a well. Use the semantic utility, never a numbered scale: `text-stone-600` is a build failure.

### Semantic shades

Light mode runs each role dark enough to pass WCAG AA three ways on paper: as text on the
ground, as text on its own 10% tint (`subtle` alerts and badges), and as white text on the
solid fill. Dark mode uses **400** throughout.

| Role | Light shade | Text on ground | Text on tint | White on solid |
|---|---|---|---|---|
| `primary` | 700 | 5.64 | 4.88 | 6.30 |
| `secondary` | 600 | 6.83 | 5.91 | 7.63 |
| `success` | 800 | 6.88 | 5.89 | 7.68 |
| `info` | 800 | 6.77 | 5.82 | 7.56 |
| `warning` | 800 | 6.35 | 5.46 | 7.09 |
| `error` | 800 | 7.18 | 6.04 | 8.02 |

`clay-600`, the shade of the mark, is 4.10:1 as text on the ground. That is why links and
buttons use 700 and the mark, which is a shape and not text, keeps 600 in its generated files.

### Letter paper and ink

A letter's paper and ink are chosen by its writer and are part of the encrypted letter. They
are tokens like everything else, so a letter reads correctly in both colour modes.

| Paper | Stored as | Light | Dark | Utility |
|---|---|---|---|---|
| Plain | `plain` | sheet `#fdfbf6` | `stone-800` | `bg-elevated` |
| Cream | `soft` | `#f7edd8` | `#2f2a21` | `bg-paper-cream` |
| Brown | `card` | `#e3d5bb` | `#3a3226` | `bg-paper-kraft` |

| Ink | Stored as | Light | Dark | Utility | Lowest contrast (on brown) |
|---|---|---|---|---|---|
| Black | `black` | `stone-900` | `#fff` | `text-highlighted` | 12.08 |
| Coloured | `accent` | `clay-800` | `clay-300` | `text-ink-colour` | 5.58 |
| Faded | `faded` | `stone-600` | `stone-400` | `text-muted` | 5.00 |

Coloured ink is `clay-800`, not the primary shade: `clay-700` is 4.35:1 on brown.

---

## Typography

### Families

| Token | Family | Use |
|---|---|---|
| `font-display` | Instrument Serif, 400 only | `h1`–`h3`, the wordmark, large numerals |
| `font-serif` | Lora, 400 and 700 with italics | Anything written to be read: a page's opening sentence, the gazette, captions people wrote, legal pages, a letter's default face |
| `font-sans` | Inter | Controls, labels, navigation, hints, tables |
| `font-mono` | JetBrains Mono | Postmarks, the who-can-read label, recovery codes, key fingerprints |

One rule sorts every piece of text: **if a person will read it as prose, it is in a serif; if
they will press it or fill it in, it is in the sans.**

Headings are set in the display serif at weight 400 with `-0.02em` tracking. The size does the
work, not the weight. Emphasis inside a heading is italic, one word at most.

### Letter faces

A letter's paper is the one surface where the writer picks the face, and it is part of the
encrypted letter. These faces appear on the paper of a letter (writing, reading, and later
print) and nowhere else in the interface.

| Choice | Family | Licence |
|---|---|---|
| Serif | Lora, 400 and 700, with italics | OFL 1.1 |
| Sans | Inter | OFL 1.1 |
| Typewriter | Courier Prime, 400 and 700, with italics | OFL 1.1 |
| Quick hand | Caveat, 400 and 700 | OFL 1.1 |
| Neat hand | Kalam, 400 and 700 | OFL 1.1 |
| Cursive | Homemade Apple, 400 | Apache 2.0 |

They are declared in `layers/letters/app/assets/css/letter.css` and
`layers/letters/nuxt.config.ts`, and self-hosted like the rest. The paper is also the one
place faux bold and italic are allowed (`font-synthesis`), because a handwriting face has one
weight and a writer who marks a word bold must see it. Headings inside a letter are sized in
`em` so they scale with the chosen face.

### Scale

| Token | Size | Line height |
|---|---|---|
| `text-xs` | 0.75rem | 1.4 |
| `text-sm` | 0.875rem | 1.5 |
| `text-base` | 1rem | 1.65 |
| `text-lg` | 1.125rem | 1.6 |
| `text-xl` | 1.375rem | 1.4 |
| `text-2xl` | 1.75rem | 1.3 |
| `text-3xl` | 2.25rem | 1.2 |
| `text-4xl` | 3rem | 1.1 |
| `text-5xl` | 3.75rem | 1.05 |

Body copy runs at `text-base` with a 1.65 line height, looser than Tailwind's default, because
this is a product for reading. Prose in `font-serif` runs at `text-lg`. Never set arbitrary
sizes (`text-[13px]`).

---

## Space, shape, elevation

- **Spacing:** standard Tailwind scale only: 1, 2, 3, 4, 6, 8, 12, 16, 24. No invented values.
- **Container:** `72rem` max width (`--ui-container`). Use `<UContainer>` for page shells; the
  page inside it sets its own column (see The house › Page shape).
- **Radius:** `0.25rem` base (`--ui-radius`). Paper has square-ish corners. Nothing is a pill
  except avatars and badges.
- **Borders:** 1px, `border-default`. Structure comes from rules and spacing.
- **Elevation:** none on paper. Light mode may use `shadow-sm` only on something that really
  floats over the page (a menu, a popover). Dark mode elevates with lighter surfaces.

---

## Motion

Two curves and a short list of things that move. Anything not on the list does not move.

| Token | Value | Use |
|---|---|---|
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Something landing or being pressed: a slight overshoot |
| `--ease-settle` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Something arriving and coming to rest |

| What | When | How | Reduced motion |
|---|---|---|---|
| A control changes state | Hover, focus, toggle | 150ms `ease-out` | Kept |
| **A button gives** | Pressed | Scale to 0.96, 120ms spring | Kept (it confirms) |
| **An envelope leans** | Idle on the shelf | Still for four fifths of a 6.4s to 8.5s cycle, then a lean of 1.6° and back. Each keeps its own pace | Off |
| **An envelope is reached for** | Hover | Lifts 4px and its flap eases open, 200ms spring | Kept |
| **A letter unfolds** | Opened | The sheet is revealed from its top third, 520ms settle, once | Off |
| **The send-off** | A letter is sealed | Envelope pops in, stamp lands at 350ms, letter drops into the postbox at 950ms, postbox wiggles. Two seconds, then the desk | Skipped entirely |
| **The bar hops** | Arriving at a place | 5px up and back, 400ms spring | Off |
| **Content rises** | Scrolled into view | 16px and a fade, linked to scrolling where the browser can; otherwise it is simply there | Off |
| **A diagram keeps pace** | Scrolling an explainer page | Each drawing moves over its own stretch of its scene's way across the window: a letter along its road, a day inked in, a copy appearing. Linked to scrolling, no script, never pinned | Off: the finished diagram is simply there |
| **The rail envelope** | Scrolling the landing page | Stuck to the middle of the window inside its rail, so scrolling carries it. No script | Kept (it is scrolling) |
| **A print straightens** | Hover on a room photo | To 0° and up 4px, 200ms spring | Kept |
| **A pin lands** | The map appears | Scale from 0.6, 420ms spring, 90ms apart, once | Off |
| **The squiggle draws** | The landing headline appears | 700ms `ease-out`, once | Off |
| Pendulum, leaves, flame, cat | Always | Loops of 1s to 7s, a few degrees | Off |

- **Idle motion is slow and small.** A loop is at least a second long and moves a few degrees.
  If it can be seen from across the room it is too much.
- **One-shots are short.** Nothing a person waits through lasts longer than 520ms, except the
  send-off, which is the one ceremony in the product and is still two seconds.
- **Nothing moves on words.** No animated text, no typing effects, no counters.
- **Motion never implies watching.** No pulsing dots, no "live" shimmer, no presence.
- **Pages do not transition.** A page change is instant: a transition keeps the old page on
  screen after the address has changed, and people (and tests) type into it.
- **Scrolling belongs to the reader.** No scroll-jacking, no pinned sections, no parallax, no
  smooth-scroll script. Things may respond to scrolling; they never take it over.
- **Reduced motion is honoured in one place:** `main.css` zeroes every animation and
  transition under `prefers-reduced-motion`, the scroll-linked reveal is wrapped in its own
  query, and the send-off checks before it plays. A component never re-implements this.
- Skeletons over spinners for loads above 300ms.

---

## Imagery

- **Photographs of real things, or the house's own drawings** (see Play). A letter on a
  table, a real mantel, a real family. Never stock, and never a drawing of a person.
- **The product is its own picture.** Where a page needs to show what a letter is, it renders
  a real letter with the product's own paper component, not a mock-up or a screenshot.
- **The map** is drawn by the server from public coastline data in ink and rule colours. It
  shows cities people said. It is not a live map and never looks like one: no pins that
  bounce, no avatars, no routes.
- **Family photos** are shown as they are: square-cropped in a grid, whole when opened. No
  filters, frames, tilts or polaroid borders.

---

## Component behavior

### The objects

- **Sheet (`<LetterPaper>`):** the letter. Its chosen paper, a 1px rule, `px-6 py-8` growing to
  `px-10 py-12` from `sm`. Nothing else on the page competes with it: controls sit above or
  below, never over it.
- **Envelope:** an unopened letter on the mantel. A sheet with a pen-line edge, its sender in
  the display face, its postmark in mono, its stamp, and a flap: one line in `primary` drawn
  from the top corners to a point. The flap is the only "new" marker in the product. An
  opened letter has no flap.
- **Shelf:** a `bg-inverted` bar on `/mantel` with the clock, the candle and the plant
  standing on it, the envelopes between them, and the cat when there are none. It is the
  mark's shelf made real.
- **Postmark:** `font-mono text-xs uppercase tracking-wide text-muted`.
- **Who can read this (`<WhoReads>`):** see its own section.

### NuxtUI components

- **Buttons:** primary = solid clay, secondary = outline neutral, destructive = solid error.
  One primary button per view. NuxtUI's defaults carry weight and radius.
- **Cards:** NuxtUI `subtle` variant: a sheet with a hairline ring and no shadow.
- **Inputs:** 1px `border-accented`, filled with the ground colour, so a field on a sheet
  reads as set into it. Focus shows a 2px primary ring, never a glow.
- **Alerts:** for something that happened or needs doing. Never for a standing fact about the
  product (that is prose, or `<WhoReads>`).
- **Badges:** for a state a person must act on ("Invited", "Returned"). Never a count.
- **Toasts:** only to confirm an action the page cannot show another way. Never for
  announcements.
- **Focus:** every interactive element has a visible focus-visible ring. Never `outline: none`
  without a replacement.
- **Links:** inline prose links are `text-primary` **and** underlined (see Accessibility ›
  Contrast). Standalone links in navigation or footers are colour-only by design.
- **Long-form content:** markdown renders through NuxtUI's `Prose*` components. Two of their
  defaults contradict this file and are overridden in `app.config.ts` under `ui.prose`:
  `h1`–`h3` drop `font-bold`, and inline links get a real `underline`. Measure is `max-w-2xl`.
- **Empty states:** one sentence of `text-muted` plus at most one action. No illustrations.
- **Tables:** `font-mono` for numeric columns, right-aligned. Row separators, not zebra striping.

---

## Accessibility

WCAG 2.2 AA is the floor, not the goal. Two gates enforce it, and they see different
things: `bun run design:check` reads source for patterns a regex can catch, and
`bun run test:a11y` runs axe in a real browser against every public route in **both** color
modes, which is the only way to check a rendered contrast ratio. What neither can judge —
whether a label actually describes its field, whether alt text is meaningful — is on review.

### Contrast

| Intent | Minimum |
|---|---|
| Body copy, labels, any text below `text-xl` | 4.5:1 |
| `text-xl` and up | 3:1 |
| Borders, focus rings, icons that carry meaning | 3:1 |
| Disabled text, decorative rules | none |

The semantic tokens in Color are vetted at both ends of the color-mode switch. A numbered
scale is a build failure precisely because `text-stone-500` can pass in light mode and fail
in dark — the token layer *is* the contrast guarantee.

**Never convey state by color alone.** Every status pairs its color with an icon or a word.
`<UBadge color="error" icon="i-lucide-x">Failed</UBadge>`, never a bare red dot.

The same rule catches inline links: a link inside a paragraph is **underlined**
(`underline underline-offset-2`), because `text-primary` alone distinguishes it from the
surrounding prose by color only. Links that are already unmistakably links by position —
nav items, footer rows, buttons — don't need it.

### Keyboard and focus

- Every interactive element is reachable and operable by keyboard, in DOM order.
- A visible `focus-visible` ring on everything focusable: 2px, `primary`. Suppressing the
  outline without replacing it is a build failure.
- No positive `tabindex`. `tabindex="-1"` is for programmatic focus targets only.
- Handlers go on a `<button>`, an `<a>`, or a NuxtUI component — never a `<div @click>`.
  That is where roles and keyboard support come from for free.
- A skip link is the first focusable element on the page, pointing at `#main`.

### Structure and labels

- `<html lang>` is set (`nuxt.config.ts` → `app.head.htmlAttrs`).
- One `<h1>` per page. Heading levels never skip.
- Landmarks on every page: `header`, `nav`, `main` (id `main`), `footer`.
- Every image and avatar carries `alt`. Decorative images take `alt=""` — an empty string,
  not a missing attribute.
- Form fields get a visible label through `<UFormField>`. A placeholder is not a label.
- Icon-only buttons need `aria-label`. An icon with no accessible name is an unlabeled
  button to a screen reader.

### Viewport and touch

- **Height:** `min-h-dvh`, never `min-h-screen`. Mobile browser chrome makes `100vh` taller
  than the visible viewport, which hides the bottom of the page under the URL bar.
- **Overscroll:** the page doesn't bounce. `main.css` sets `overscroll-behavior-y: none` on
  `html` and `body`, so scrolling past the top or bottom stops dead on iOS and on Mac
  trackpads instead of rubber-banding the sticky header and page background. It is
  vertical only: the horizontal swipe-back gesture still navigates. The cost is the
  browser's pull-to-refresh on mobile, which these apps don't need.
- **Width:** a page never scrolls sideways at 375px. Wide tables scroll in their own
  `overflow-x-auto` box, and that box is `relative`: an absolutely positioned child (an
  `sr-only` caption or "Actions" header) with no positioned ancestor inside the box escapes
  its clipping and stretches the page. `test/a11y/accessibility.spec.ts` checks every route.
- **Safe areas:** anything pinned to a viewport edge uses the safe-area utilities
  (`bottom-safe`, `right-safe`) so it clears the iOS home bar and the notch in landscape.
  The `viewport-fit=cover` meta in `nuxt.config.ts` is what makes those insets non-zero.
- **Target size:** two floors, because one number can't serve both a mouse and a thumb.
  - **24x24px everywhere** (WCAG 2.5.8, AA). NuxtUI's `sm` and `md` sizes clear this on
    their own; `size="xs"` does not reliably, so it is desktop-dense-chrome only.
  - **44x44px on coarse pointers.** Apply the `min-touch` utility, which is scoped to
    `@media (pointer: coarse)` — it buys the thumb its target without inflating the
    mouse-driven UI, whose 29-33px controls are the density this system is for.

  Every icon-only control gets `min-touch`; `design:check` enforces that one, because an
  icon-only button is the case that ends up smallest and is hardest to spot by eye.
  Anything pinned to a viewport edge or acting as a primary mobile action gets it too.
- **Motion:** `prefers-reduced-motion` is honored globally in `main.css` (see Motion) — no
  component should re-implement it.

---

## Compiling to NuxtUI v4

`/design-sync` maps the sections above onto the two generated files:

| This file | Destination |
|---|---|
| Primary ramp | `main.css` → `@theme static` → `--color-clay-*` (all 11 shades required) |
| Semantic assignments | `app.config.ts` → `ui.colors` |
| Semantic shades | `main.css` → `:root`/`.dark` → `--ui-primary` … `--ui-error` |
| Surfaces — paper | `main.css` → `:root`/`.dark` → `--paper-*`, then `--ui-bg*` and `--ui-border*` |
| Ink | `main.css` → `:root`/`.dark` → `--ui-text*` |
| Letter paper and ink | `main.css` → `@utility bg-paper-cream`, `bg-paper-kraft`, `text-ink-colour` |
| Families + scale | `main.css` → `@theme static` → `--font-*`, `--text-*` |
| Base type rules | `main.css` → `@layer base` |
| Radius, container | `main.css` → `:root` → `--ui-radius`, `--ui-container` |
| Component behavior | `app.config.ts` → per-component `slots` / `defaultVariants` |
| Play › The drawings | `main.css` → `:root`/`.dark` → `--line`, `--art-*` |
| Motion | `main.css` → `--ease-*`, `@keyframes`, `@utility play-*`, `.btn-give` |
| Safe-area utilities | `main.css` → `@utility bottom-safe` / `right-safe` / `pb-safe` |
| Touch-target floor | `main.css` → `@utility min-touch` |

NuxtUI declares its surface and ink variables inside `@layer theme`, and `main.css` sets them
unlayered, so both `:root` and `.dark` must state every one: a value given only for `:root`
would win over NuxtUI's own dark value and put paper on a dark page.

The Brand mark section compiles through a second, smaller pipeline of its own:

| This file | Destination | Run by |
|---|---|---|
| Brand mark › Construction | `app/components/Brand/Logo.vue` | `/logo-sync` |
| Brand mark › Color roles | `public/favicon.svg`, `apple-touch-icon.png`, `og.png` | `bun run brand:generate` |

What no stylesheet can express lives in three places `/design-sync` does not own:
`<html lang>` and `viewport-fit=cover` in `app.head` in `nuxt.config.ts`; the shell (skip
link, header, the places, the footer) in `app/layouts/default.vue` with its parts in
`layers/post/app/components/House/`; and `<WhoReads>` in `layers/post/app/components/`.

Verify the result at `/design-system` in dev: every token and component state on one page,
in both color modes.

---

## What we looked at

In November 2026 we photographed the marketing pages of 25 analog and slow products at phone
and desktop width, and every page of our own. What we took, and what we refused:

| Looked at | Took | Refused |
|---|---|---|
| reMarkable, Storyworth, Aura | A light serif for headlines; one serif for what is read, sans only for controls | Sale banners, review stars, emoji |
| Papier, Letterloop | A warm paper ground (`#FAF7F0` to `#F3EEE7`) with warm near-black ink; one accent | Discount tiles, "loved by 300k" social proof |
| Stripe Press | A warm near-black dark mode; the object as the whole interface | Phone layouts that crop the object |
| Are.na, iA Writer | A narrow measure, the real product as the hero, a bottom bar on a phone | Soft drop shadows on the specimen |
| Ente, Signal | Privacy stated once in plain words | Lock icons, shields, "military-grade" |
| FutureMe, Postcrossing | Time given as plain intervals and honest states ("traveling") | Cobalt-and-gradient SaaS dress, stamp-and-airmail costume |
| Freewrite, Baron Fig | Texture from photographs of real things, never from CSS | — |
| The Light Phone | Emptiness as pacing: one thing on the screen | — |
| Tinybeans, HEY, Day One, Standard Notes | — | Pastel blobs and rounded faces; gradient headlines; award laurels; a 27-partner consent wall on a product about family privacy |

A second pass looked at 22 playful products for what makes a page feel alive (Tin Can, Pok
Pok, PostHog, Playdate, Toca Boca, Graza, Yoto, Tonies and others), reading their animation
CSS for real numbers.

| Looked at | Took | Refused |
|---|---|---|
| Tin Can | Things at rest that still move: charms that sway, each at its own pace | Its colour blocks, sticker buttons, starbursts and marquee. They are Tin Can's, and a child's |
| PostHog, Oatly | The overshoot curve `cubic-bezier(0.34, 1.56, 0.64, 1)` for things that land; reduced motion handled everywhere | A mascot that roams the page; full-screen transitions |
| Pok Pok, PostHog | A pen underline that draws itself; play at the edges of a calm reading surface | Characters, torn-paper section edges |
| Toca Boca, Sago Mini | Idle motion that is rare: a short wiggle, then a long rest | Constant motion, and no reduced-motion handling at all |
| Playdate, Graza, Mailchimp | — | Marquees, jelly squash-and-stretch |
| Poolsuite | A clock on the page that tells the real time | The costume around it |

Slowly and Field Notes blocked an automated browser and were not seen. No product was seen
behind its sign-in.

The same pass over Dear Mantel found it wearing the template's placeholder identity on a white
page, three separate navigations, a floating button over the text on every phone page, and
the mantel drawn as a list of grey boxes. This file is the answer to that.

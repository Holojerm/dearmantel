# Dear Mantel

Letters for family and friends, slowly. They arrive on a postal rhythm, so people can write
less often without it feeling rude.

- Letters take as long as the post would: two to nine postal days by distance, never on a Sunday.
- The sender sees "In transit, arrives Thursday" and nothing after. No read receipts, no delivery confirmation.
- The only notification says something arrived on your mantel. It never says from whom or how many.
- Letters are end-to-end encrypted. The server knows who writes to whom and when, never what.
- Invite-only pairs of people who already know each other. No discovery, no streaks, no couriers.

**Status:** in development, not yet open to sign-ups.

**Licence:** [FSL-1.1-MIT](LICENSE). The source is public so the privacy claims can be checked;
each release becomes MIT after two years. Dear Mantel is a product of Holojerm LLC. See
[NOTICE.md](NOTICE.md).

Built on [nuxt-cf-template](https://github.com/Holojerm/nuxt-cf-template). The rest of this
file is the template's operating reference for **Nuxt 4 + Cloudflare Workers**.

| Layer | Technology |
|---|---|
| Framework | Nuxt 4 |
| UI | NuxtUI v4 + Tailwind CSS v4 |
| Backend | Cloudflare Workers (via NuxtHub + Nitro) |
| Database | Cloudflare D1 (SQLite via Drizzle ORM) |
| KV / Cache | Cloudflare KV |
| File Storage | Cloudflare R2 |
| Auth | nuxt-auth-utils — magic-link sign-in, plus Apple / Google / GitHub OAuth, wired end to end |
| Email | Resend over fetch — sign-in link, welcome, security notices |
| Linting | oxlint + oxfmt |
| Validation | Zod |
| Testing | Vitest + `@cloudflare/vitest-plugin` (real `workerd` runtime, real bindings) |
| Deployment | Wrangler → Cloudflare Workers |
| CI/CD | Cloudflare Workers Builds (lint → typecheck → test → build → deploy) |

---

## Product decisions

**Single-user by design.** This template is a consumer product: one person, one account. There are no teams, seats, workspaces, or org switchers. If you are building B2B, that is a different data model; retrofitting teams onto this one costs more than starting from a B2B starter.

**English-only, deliberately.** The template ships without an i18n layer on purpose: for a consumer SaaS the cost of maintaining translations before you have users in a market is pure overhead, and half-translated UI is worse than honest English. Revisit when a real market signal exists — meaningful non-English traffic in analytics, or a paid-user request pattern — and add `@nuxtjs/i18n` at that point, not speculatively.

---

## Fork & deploy in 5 steps

### 1. Rename the project

```bash
bun run rename acme-widgets --display "Acme Widgets"
```

That rewrites every occurrence of `my-app` across `wrangler.toml`, `package.json`
(scripts + `portless.name`), `.mcp.json.example` and `fleet.json`, sets both `[[ratelimits]]`
`namespace_id`s to a pair derived from the new name (the namespace is scoped to your Cloudflare
account, so every app on it needs its own — `scripts/ratelimit-namespace.ts`), and prints what's
left for you to do by hand. Missing one of these is not obvious later: Workers Builds refuses every build when
the dashboard Worker name doesn't match `wrangler.toml`, and the Nuxt MCP server just never
connects when its URL doesn't match `portless.name`.

<details>
<summary>What it changes, if you'd rather do it by hand</summary>

**[`wrangler.toml`](./wrangler.toml):**

```toml
name = "my-app"              # Worker name
database_name = "my-app-db"  # D1 database name
bucket_name = "my-app-blob"  # R2 bucket name

NUXT_PUBLIC_APP_NAME = "My App"  # Display name shown in the UI
```

**[`package.json`](./package.json) — `db:migrate` scripts hardcode the D1 name, and the `portless.name` field sets the local dev URL:**

```json
"db:migrate": "wrangler d1 migrations apply my-app-db --local",
"db:migrate:remote": "wrangler d1 migrations apply my-app-db --remote",
"portless": { "name": "my-app", "script": "dev:app" }
```

**[`.mcp.json.example`](./.mcp.json.example) — the Nuxt MCP server URL** (`bun dev` copies it to the gitignored local MCP config):

```json
"nuxt": { "type": "sse", "url": "https://my-app.localhost/__mcp/sse" }
```

(The wrangler `migrations apply` subcommand takes the database name, not the binding, so it has to be hardcoded. `portless.name` and the MCP URL must match — they both share the same `<name>.localhost` host.)

</details>

### 2. Create Cloudflare resources

Four resources, and the queue is the one that bites: `wrangler deploy` **fails** on a
queue that doesn't exist yet, unlike the dead-letter queue, which is created for you.

```bash
wrangler d1 create my-app-db          # copy the database_id it prints
wrangler kv namespace create my-app-kv   # copy the id it prints
wrangler r2 bucket create my-app-blob
wrangler queues create my-app-email
```

The KV namespace is named after the app on purpose. Namespace *titles* are unique per
account and the binding name in `wrangler.toml` (`binding = "KV"`) is a separate thing, so a
namespace titled plain `KV` can only ever be created once — the second fork to try gets
`A KV namespace with the title "KV" already exists`. Same rule for every title below: name the
resource, keep the binding.

Then paste the two ids into `wrangler.toml`:

```toml
[[d1_databases]]
database_id = "paste-your-d1-id-here"

[[kv_namespaces]]
id = "paste-your-kv-id-here"
```

The R2 bucket and the queue are matched by **name**, so they need no id — but the names
must equal `bucket_name` and `queue` in `wrangler.toml`. `bun run rename` keeps all of
them in step, including `EMAIL_QUEUE_NAME` in `server/utils/email-queue.ts`.

### 3. Set up environment variables

```bash
cp .env.example .env
```

Only four things are actually required to run:

```
NUXT_APP_SECRET=         # 32+ char random string: openssl rand -base64 32
                         # Seals session cookies (Nuxt's appSecret). Dev makes
                         # one up if unset; production 500s every session
                         # read without it. Rotating it signs everyone out.
NUXT_SESSION_PASSWORD=   # 32+ char random string: openssl rand -base64 32
                         # Not the session key, despite the name: the app's
                         # salt for unsubscribe links and IP/search hashes.
                         # The per-address salt is a generated row in D1
                         # (instance_secrets), not derived from this value.
                         # Never delete that row.
CLOUDFLARE_API_TOKEN=    # Cloudflare API token with Workers + D1 + KV + R2 edit perms
CLOUDFLARE_ACCOUNT_ID=   # Your Cloudflare account ID
```

Everything else — OAuth, Resend, PostHog, Turnstile — is optional and **degrades instead of
breaking**: an unset provider means that sign-in button doesn't render, an unset Resend key means
emails are logged no-ops, an unset Turnstile key means no bot check renders or runs. You can go all
the way through the app before creating a single third-party account.

The one to revisit before you ship is **Resend**, because magic-link sign-in is the primary way in
and it is the one email that cannot degrade to a no-op. In dev the link goes to the server console
instead; in production, no key means that endpoint honestly 503s. See Auth, below.

See `.env.example` for the full list, including the exact OAuth callback URLs to register.

Set both secrets on the Worker (required for production):

```bash
openssl rand -base64 32 | bunx wrangler secret put NUXT_APP_SECRET
openssl rand -base64 32 | bunx wrangler secret put NUXT_SESSION_PASSWORD
```

### 4. Connect Workers Builds (CI/CD)

CI/CD runs on [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), Cloudflare's native build system — no GitHub Actions, no API tokens to rotate. In the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/workers-and-pages):

1. Select (or create) the Worker — its name **must match** `name` in `wrangler.toml`.
2. Go to **Settings → Build → Connect** and pick this repository.
3. Configure two build triggers:
   - **Production branch `main`**:
     - **Build command**: `bun run typecheck && bun run build`
     - **Deploy command**: `bun run deploy:ci`. This applies pending D1 migrations to
       production, deploys, then runs `deploy:smoke` (fails the build if `/` or `/api/health`
       is not serving). If a migration fails, the deploy doesn't run and production stays on
       the previous build.
   - **Non-production branches** (`*`, excluding `main` and `ops-journal`):
     - **Build command**: `bun run ci` (the PR gate: format:check, email:build, the check scripts including migrations:check, typecheck, test, build)
     - **Deploy command**: `echo "Preview uploads disabled: branch builds would run with production bindings"`,
       so nothing is uploaded.
   - The browser suites are deliberately absent from both — Workers Builds cannot launch Chromium, so
     `.github/workflows/browser-suites.yml` runs them instead. See AGENTS.md › Gotchas.
   - **API token**: the token Workers Builds generates has no D1 permission. Under **My
     Profile → API Tokens**, edit that token and add **Account → D1 → Edit**. Without it,
     every production deploy fails at the migrate step.
4. Under **Build Variables and Secrets**, add `NUXT_SESSION_PASSWORD` (mark it secret). `NUXT_APP_SECRET` is a Worker secret only; the build does not read it.
5. Enable **non-production branch builds** (Settings → Build → Branch control) so every PR branch gets the `bun run ci` check.
6. If you re-enable branch uploads for preview URLs, point those builds at the preview
   resources rather than production's: add the build variable `CLOUDFLARE_ENV=preview`
   **on the non-production branch trigger only**, and set up
   [the preview environment](#preview-environment) below. Otherwise every preview URL runs
   branch code against your live database.

Pushes to `main` typecheck, build and deploy. Pushes to other branches run `bun run ci` and deploy nothing. The required checks are `browser-suites` and `Workers Builds: <worker>`, and the ruleset requires branches to be up to date before merging, so nothing re-runs after a merge.

**Node.js version.** The build shells out to the `nuxt` bin, which runs under Node. Workers Builds
defaults to Node 24 and preinstalls 22 and 24; the committed `.node-version` pins it anyway,
because the failure mode if someone later sets `NODE_VERSION` to something older is not a clear
error but an interactive install prompt that dies in `postinstall`. Workers Builds reads `.node-version`,
`.nvmrc`, and a `NODE_VERSION` build variable, in case you prefer the dashboard.

### 5. Run locally and deploy

```bash
bun install
bun dev            # Start dev server at https://my-app.localhost (via portless)
```

NuxtHub applies everything in `server/db/migrations/` to its local database
(`.data/db/sqlite.db`) when the dev server boots, so there is no local migrate step.
`bun db:migrate` targets wrangler's *separate* local sandbox, which the dev server does
not read — see .claude/docs/gotchas.md.

> **First-run note:** `bun dev` runs through [portless](https://portless.sh) so multiple Nuxt projects (and AI agents) can run side-by-side without colliding on port 3000. The first invocation will request `sudo` once to bind port 443 and trust a local CA for HTTPS. Subsequent runs are silent. **macOS / Linux only — no Windows support.**
>
> Each git worktree gets its own hostname (`<worktree-dir>.my-app.localhost`), printed on startup, so several checkouts — or several agents — can run `bun dev` at once. See .claude/docs/gotchas.md for why the worktree directory is the key rather than the branch.

Push to `main` to trigger a production deploy via Workers Builds, or deploy manually:

```bash
bun run deploy     # Note: NOT `bun deploy` — that's reserved by Bun
```

> **A manual deploy does not run migrations.** `wrangler deploy` doesn't apply them to your
> remote D1, and NuxtHub's build-time migration step writes to a local file on the build
> machine. Workers Builds does apply them, through its deploy command `bun run deploy:ci`
> (step 4 above). After a manual deploy, run this against production, or the Worker will
> query tables that don't exist:
>
> ```bash
> bun run db:migrate:remote
> ```

---

## Common commands

```bash
bun dev               # Start dev server at https://my-app.localhost (via portless).
                      # In a git worktree: https://<worktree-dir>.my-app.localhost
bun dev:app           # Start dev server directly on http://localhost:3000 (bypass portless)
bun build             # Build for Cloudflare
bun lint              # Run oxlint
bun lint:fix          # Auto-fix lint issues
bun format            # Format with oxfmt
bun typecheck         # TypeScript type checking
bun run brand:generate # Rebuild favicon, app icon, and og.png from the brand mark
bun run brand:check   # Fail if those files no longer match the mark (part of ci)
bun run fleet:check   # Fail if fleet.json no longer matches wrangler.toml (part of ci)
bun run crons:check   # Fail if [triggers] crons and nitro.scheduledTasks disagree (part of ci)
bun run ci            # Format (writes) + lint + design/brand/seo/fleet/crons gates + typecheck + test + build — Workers Builds runs this on non-production branches
bun run ci:fast       # Cheap gates + typecheck + tests touched since origin/main — for iterating
bun run ci:browser    # playwright:install + test:a11y (a11y + CSP + E2E) — GitHub Actions runs this,
                      # because Workers Builds has no Chromium libraries. See AGENTS.md › Gotchas.
bun db:generate       # Generate Drizzle migration after schema changes
bun db:migrate        # Apply migrations to local D1 (via wrangler)
bun db:migrate:remote # Apply migrations to remote/prod D1
bun db:migrate:preview # Apply migrations to the preview D1 (nothing does this for you)
bun db:studio         # Open Drizzle Studio (visual DB browser)
bun seed              # Seed the local dev DB — a demo user and an admin, see scripts/seed.ts
bun run rename <name> # Rewrite the my-app placeholder everywhere it appears
bun run test          # Run Vitest in workerd via @cloudflare/vitest-plugin
bun test:watch        # Same, in watch mode
bun run test:a11y     # Playwright: a11y + CSP + E2E, sharing one dev server (see below)
bun run deploy        # Build + deploy to Cloudflare (`bun deploy` is reserved by Bun)
bun run build:preview # Build with the [env.preview] bindings (CLOUDFLARE_ENV=preview)
bun run deploy:preview # Same, then deploy — creates/updates the my-app-preview Worker
```

> **Note:** use `bun run test`, not `bun test`. The bare form invokes Bun's built-in test runner, which doesn't know about Vitest or the Cloudflare pool.

---

## Project structure

```
/
├── app/
│   ├── components/     # Reusable UI components (group by feature)
│   │   └── Brand/      # Logo.vue — the mark, and the only place it is drawn
│   ├── composables/    # Shared stateful logic
│   ├── layouts/        # Page layouts (default.vue: nav + footer + legal links)
│   ├── middleware/     # Route guards: auth (UX only — not the boundary)
│   ├── pages/          # File-based routing (landing, login, account, dashboard, legal)
│   ├── types/          # Frontend-only TypeScript types
│   └── utils/          # Auto-imported client helpers
├── server/
│   ├── api/
│   │   └── auth/       # Magic link, OAuth providers, logout, provider list, dev sign-in
│   ├── db/
│   │   ├── schema.ts   # Single source of truth for DB schema
│   │   └── migrations/ # Generated by drizzle-kit
│   ├── middleware/     # Auth guard + auth-surface rate limiting
│   ├── routes/         # Non-/api routes: ingest proxy, robots, sitemap
│   └── utils/          # auth, users, email, rate-limit
├── test/               # Vitest tests (workerd-runtime, real CF bindings)
├── .claude/            # Claude Code config (commands, skills, MCP)
├── .github/            # Dependabot config (CI/CD lives in Cloudflare Workers Builds)
├── vitest.config.ts    # Vitest + @cloudflare/vitest-plugin config
├── DESIGN.md           # Visual design system — the source of truth, see /design-sync
├── brand.lock.json     # Fingerprint of the generated brand assets (see brand:check)
├── wrangler.toml       # Cloudflare config (rename project here)
├── AGENTS.md           # AI development guide — the index, kept small
├── TEARDOWN.md         # Template teardown recipes
└── .claude/docs/       # Per-subsystem detail, loaded on demand by agents
```

---

## Testing

Tests run inside the same `workerd` runtime that Cloudflare runs in production, via [`@cloudflare/vitest-plugin`](https://developers.cloudflare.com/workers/testing/vitest-integration/). D1, KV, and R2 bindings are real (in-memory, isolated per test file) and reached through the `cloudflare:test` import:

```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('users table', () => {
  it('round-trips a row through D1', async () => {
    await env.DB.prepare('CREATE TABLE t (x TEXT)').run()
    await env.DB.prepare('INSERT INTO t VALUES (?)').bind('hi').run()
    const row = await env.DB.prepare('SELECT x FROM t').first<{ x: string }>()
    expect(row?.x).toBe('hi')
  })
})
```

For testing helpers that use the auto-imported `db` (the Drizzle client), construct a Drizzle instance from `env.DB` inside the test:

```ts
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '~/server/db/schema'

const db = drizzle(env.DB, { schema })
```

See [`test/identity.test.ts`](./test/identity.test.ts) for the starter pattern. Co-located tests under `server/**/*.test.ts` are also picked up by the default config.

### End-to-end (Playwright)

`test/e2e/` and each layer's `layers/<name>/test/e2e/` cover the flows the product exists for, in a
real browser against a real (dev) server — the a11y and CSP suites only ever look at signed-out
routes, so this is the only place `/dashboard` and `/account` get exercised at all. Core's specs
need no optional layer; a layer that ships browser specs adds its own project:

| Spec | Proves |
| --- | --- |
| [`sign-in-gated-page.spec.ts`](./test/e2e/sign-in-gated-page.spec.ts) | Signed-out → `/login?redirect=…`. |
| [`sign-out-everywhere.spec.ts`](./test/e2e/sign-out-everywhere.spec.ts) | Revoking from one device signs the other out, and only the other. |

**State is driven through the server, not around it.** `bun seed`'s `bun:sqlite` writes are invisible
to an already-running dev server (see .claude/docs/gotchas.md › "The dev server caches its DB
connection"), so these specs sign in via
`POST /api/auth/dev` — the same dev-only shortcut described under [Auth](#auth). Every user is
fresh and unique per run (`e2e-<run>-<case>@example.com`) — nothing here reads the rows `bun seed`
writes, on purpose, since the whole point is proving the flow works starting from nothing.

Runs as Playwright projects (`e2e` for core, one `e2e-<layer>` per layer that ships specs, alongside `a11y`
and `csp` in `playwright.config.ts`), sharing the one dev server the others boot — `bun run test:a11y` runs
all of them. A layer adds its server environment and warm-ups in `layers/<name>/test/e2e/e2e.config.ts`
(see `test/e2e/layers.ts`).

---

## How the build / deploy actually works

`bun run deploy` does **two** things:

1. `nuxt build` — produces `.output/` with the Cloudflare Workers preset (set in `nuxt.config.ts: nitro.preset = 'cloudflare_module'`).
2. `wrangler --cwd .output deploy` — uploads the built worker.

The Cloudflare preset has to be pinned in `nuxt.config.ts`; the `@nuxthub/core` module does **not** auto-detect it for `nuxt build` (it only auto-detected in the legacy `nuxthub deploy` command, which Cloudflare sunset Feb 2026).

Workers Builds runs the same two steps in CI — `bun run ci` covers the build (plus lint, the design-token and SEO gates, typecheck and the unit tests), and the deploy command is the same `wrangler --cwd .output deploy`. Builds run inside your Cloudflare account, so CI needs no API token. The axe, CSP and E2E suites are **not** in `bun run ci`: that image has no Chromium system libraries and is non-root, so they run in GitHub Actions instead (`.github/workflows/browser-suites.yml`).

### `wrangler.toml` is an input, not the deployed config

Nothing deploys `wrangler.toml`. The build generates `.output/server/wrangler.json` and
wrangler deploys **that**. Nitro copies your `wrangler.toml` into it — bindings, `[triggers]`,
`[[queues.*]]`, all of it — and then NuxtHub rewrites the result one last time on Nuxt's
`close` hook.

That last step is the surprising one, and it is what makes the preview environment below
work the way it does: **NuxtHub deletes the `env` key from the generated config, always.**
With `CLOUDFLARE_ENV=<name>` set it first flattens `env.<name>` into the top level; without
it, the environments are simply dropped.

The consequence to remember: `wrangler --cwd .output deploy --env preview` **cannot work**,
because by the time wrangler reads that file there are no environments left in it. The
environment is chosen when you *build*, not when you deploy.

---

## Preview environment

Preview deploys share production's D1, KV, R2 and rate-limit counters unless you set this
up. A preview URL is public and runs unreviewed branch code, so that default means every
half-finished migration and destructive query lands in your live database.

### 1. Create the preview resources

```bash
wrangler d1 create my-app-db-preview            # copy the database_id
wrangler kv namespace create my-app-kv-preview  # copy the id
wrangler r2 bucket create my-app-blob-preview
wrangler queues create my-app-email-preview
```

Paste the two ids into `wrangler.toml` under `[env.preview]` — the `database_id` on
`[[env.preview.d1_databases]]` and the `id` on `[[env.preview.kv_namespaces]]`. A fork
inherits this repo's values, so these are replacements, not blanks to fill.

> A separate namespace, deliberately, rather than `wrangler kv namespace create KV --preview`.
> That flag creates a *preview namespace attached to the production binding* and prints a
> `preview_id`, which is a different concept: it is what `wrangler dev` uses locally, not what
> a deployed `[env.preview]` Worker binds. Pasting a `preview_id` into `id` here is the kind
> of mistake that appears to work until preview writes start landing in production's KV.

### 2. Bootstrap the preview Worker once

`[env.preview]` sets `name = "my-app-preview"`, so preview is a **separate Worker** with its
own secrets — not a mode of the production one. It has to exist before Workers Builds can
upload versions to it, and this is also what registers its cron trigger and queue consumer:

```bash
bun run deploy:preview        # CLOUDFLARE_ENV=preview nuxt build && wrangler --cwd .output deploy
wrangler secret put NUXT_APP_SECRET --env preview
wrangler secret put NUXT_SESSION_PASSWORD --env preview
bun run db:migrate:preview    # nothing applies migrations for you — see below
```

Secrets are per-environment. The preview Worker starts with **none** of production's, so
repeat `wrangler secret put … --env preview` for every secret you actually need there.
Leaving Resend unset is a reasonable choice: emails become logged no-ops on preview.

### 3. Point Workers Builds at it

In the dashboard, on the **non-production branch trigger only**:

| Setting | Value |
| --- | --- |
| Build command | `bun run ci` |
| Preview deploy command | `bunx wrangler --cwd .output versions upload` |
| Build variable | `CLOUDFLARE_ENV=preview` |

The deploy command carries **no `--env` flag** — that is the whole point of the section
above. `CLOUDFLARE_ENV` on the build is what swaps the bindings; adding `--env preview`
would fail on a config that no longer has environments in it.

### Keeping it in step

`[env.preview]` repeats **every** binding and every `var`, because bindings are
non-inheritable: override one in an environment and you must override all of them. So
**adding a binding means adding it twice.** Two that are easy to miss:

- **`[[env.preview.ratelimits]]` uses a different `namespace_id` (1002).** The namespace is
  scoped to the Cloudflare *account*, so sharing 1001 would let a branch under test
  rate-limit real users out of signing in. It is also required rather than optional here:
  `ratelimits` is missing from NuxtHub's non-inheritable list, so without the block preview
  would silently inherit production's counter.
- **Migrations must be applied to the preview D1 too** (`bun run db:migrate:preview`), for
  exactly the reason the production note below gives — nothing applies them for you.

---

## Auth

Sign-in is **password and passkeys** only, from the vendored credentials layer
([`.claude/docs/credentials.md`](./.claude/docs/credentials.md)). The browser derives the sign-in
value, so the server never receives the password. A dev-only email shortcut means a fresh clone
reaches a gated page without registering anything at all.

| Piece | Where | What it does |
| --- | --- | --- |
| Token lifecycle | [`server/utils/magic-link.ts`](./server/utils/magic-link.ts) | Kept for account deletion and the nightly purge; no route mints tokens now. Covered by [`test/magic-link.test.ts`](./test/magic-link.test.ts). |
| Sign-in tail | [`server/utils/auth.ts`](./server/utils/auth.ts) | Provisions the user, seals the session, sends the welcome email, redirects. Adding a provider is ~15 lines of profile mapping. |
| Provisioning | [`server/utils/users.ts`](./server/utils/users.ts) | Find-or-create by verified email. Covered by [`test/users.test.ts`](./test/users.test.ts). |
| Dev sign-in | [`server/api/auth/dev.post.ts`](./server/api/auth/dev.post.ts) | Email, no password. `import.meta.dev` is a build-time constant, so the handler is dead code in production and the route 404s. `bun seed` writes a demo user and an admin you can sign in as this way — see below. |
| Server guard | [`server/middleware/auth.ts`](./server/middleware/auth.ts) | 401s every `/api/*` route except the allowlist in [`server/utils/public-routes.ts`](./server/utils/public-routes.ts) (documented in [`.claude/docs/auth.md › Public API surface`](./.claude/docs/auth.md)): `/api/health`, `/api/auth/`, `/api/_auth/`, the token-guarded `/api/status` and `/api/fleet`, `/api/email/unsubscribe`, and whatever a feature registers (feedback: `POST /api/feedback`). Also rate-limits the auth surface. |
| Client guard | [`app/middleware/auth.ts`](./app/middleware/auth.ts) | `definePageMeta({ middleware: 'auth' })`. UX only — see below. |

**Seed accounts (`bun seed`, [`scripts/seed.ts`](./scripts/seed.ts)):** sign in as either via the
dev endpoint above. Idempotent — re-running never duplicates a row.

| Email | State |
| --- | --- |
| `demo@example.com` | Signed in |
| `admin@example.com` | Admin console access |

**The link does not sign you in by being fetched.** Mail security gateways — Defender Safe Links,
Proofpoint, Mimecast — fetch every URL in an incoming message before the recipient sees it, and
browsers prefetch. All of that is GET traffic. So `GET /api/auth/magic-link/verify` only *reports*
whether a token is usable, and `POST` (behind the button on `/auth/verify`) is what spends it. A
scanner following the link changes nothing; the human still gets a working link.

**The request endpoint answers identically for an address it has never seen.** Otherwise it is an
account-enumeration oracle: point a script at a leaked address list and learn who has an account
here. That is also why the "check your inbox" copy says *if* that address can receive mail. The two
rate limits behind it matter for a second reason — this endpoint sends mail from a domain the
recipient trusts, to an address an anonymous caller chose, so there is a per-address limit
(5 per 15 min) on top of the per-IP one.

**Magic link needs Resend.** In dev with no key set, the sign-in URL is logged to the server console
so `git clone && bun dev` still exercises the flow. In production an undeliverable link is a 503, not
a silent "check your inbox" for a message that was never sent.

**A deleted account cannot be resurrected through it.** Deletion anonymizes the `users` row in place
and leaves it keyed by `deleted-<id>@deleted.invalid`; identity is the email address, so a link
minted for that tombstone would redeem into the deleted account's id and role
included. `isUndeliverableAddress()` refuses the whole RFC 2606 `.invalid` TLD at mint time — with
the same success body as any other address, and *after* the rate limiter, so the `X-RateLimit-*`
headers don't leak what the body withholds. Relying on Resend rejecting `.invalid` would put an
authentication boundary in a third party's input validation.

**The sign-in link is security-class mail.** It carries no `List-Unsubscribe` header, and
`MAGIC_LINK_EVENT_TYPE` (`security.sign_in_link`) makes that structural rather than incidental: the
`security.` prefix means `isMandatoryNotification()` already refuses to make it unsubscribable at
every enforcement point. It is also the one email sent before we know whether the address has an
account, so there is no user id to look a preference up by in the first place.

**Identity is the verified email address.** Sign in with GitHub today and Google tomorrow on the
same address and you get the same account, which is what people expect and what avoids duplicate
accounts. That's only safe because every caller passes an explicit
`emailVerified` flag: an unverified address would let someone register the victim's email at a lax
provider and inherit their account. Never default that flag to `true`.

**The client middleware is not a security boundary.** It runs in the browser so people see a login
page instead of an empty one. The boundary is `getUserSession` / `requireAccess` inside the
API routes. Delete the client middleware and a gated page renders empty; delete the server check
and it leaks.

**Sessions are revocable, which sealed cookies are not by default.** Every session records the
second it was sealed (`issuedAt`), every account can carry a `users.sessions_invalid_before`
watermark, and `server/middleware/auth.ts` refuses any session issued before it — so deleting your
account on a laptop ends it on the phone in the other room, instead of leaving it fully signed in
until the cookie expires. The cost is one indexed read on `users` per
authenticated API request, uncached on purpose: caching the answer would reintroduce a window in
which a revoked session still works, which is the bug. See
[`server/utils/session-guard.ts`](./server/utils/session-guard.ts). The column is a timestamp
rather than a `deleted_at` flag so the same primitive covers "sign out everywhere" later.

Adding OAuth providers, in the order they render:

1. **Apple** — developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → your
   *Services ID* → Sign in with Apple → Configure. Return URL: `https://<your-app>/api/auth/apple`.
   Five env vars, because Apple has no static client secret: the server signs a short-lived ES256
   JWT from a `.p8` key on every request. `NUXT_OAUTH_APPLE_CLIENT_ID` (the Services ID, not the App
   ID), `_TEAM_ID`, `_KEY_ID`, `_PRIVATE_KEY` (the whole `.p8`, literal newlines written as `\n`),
   and `_REDIRECT_URL`. Three things to know:
   - **`_REDIRECT_URL` is required, and only for Apple.** nuxt-auth-utils' Apple handler puts that
     value straight into the token-exchange body instead of falling back to the request's own
     origin the way the Google and GitHub handlers do. Unset, it serialises as
     `redirect_uri=undefined` and Apple answers `invalid_grant` *after* a successful consent
     screen — every earlier step looks perfect. The button doesn't render until all five are set.
   - Its callback is a cross-site **POST**, which is why that route is `apple.ts`, not
     `apple.get.ts`.
   - "Hide My Email" produces a relay address that becomes the account key, so the same person
     signing in with Google lands on a different account.
2. **Google** — Cloud Console → APIs & Services → Credentials → OAuth client ID. Authorized
   redirect URI: `https://<your-app>/api/auth/google`. `NUXT_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET`.
3. **GitHub** — optional, and **off by default**. It is a developer credential: on a consumer
   sign-in page it tells most visitors the product isn't for them, and it is the clearest tell that
   a fork was never re-aimed. Configure it for a devtool fork and it renders last; leave it unset
   otherwise. Settings → Developer settings → OAuth Apps → New. Authorization callback URL:
   `https://<your-app>/api/auth/github`.
4. In production set every one of these as a Worker secret (`wrangler secret put`), not `[vars]`.
   The Apple private key and the Resend API key are yours to set — nothing in this repo generates
   or stores them.

---

## Rate limiting

`rateLimit(event, { name, limit, windowSeconds })` — one call, auto-imported in server routes.
Applied to the whole `/api/auth/` surface (30/min per IP) and per-user on connect-code minting (10
per 5 min). Responses carry `X-RateLimit-*`, and a block is a 429 with `Retry-After`.

**The count is one row in D1.** Every call moves a counter in `rate_limits` with a single
`INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`. D1 runs writes one at a
time, so the number is exact however many requests arrive together, and it is one count across
every Cloudflare location. The row's key is a hash of the caller and endpoint, so no address is
kept, and the daily purge removes finished windows.

**Cloudflare's native Rate Limiting binding is a first check in front of it, nothing more.**
Declared as `[[ratelimits]]` in `wrangler.toml`, it can refuse a request before that request costs
a D1 write. It is never trusted to let one through. Measured on production in November 2026: 120
requests on one kept-alive connection were stopped after 31, but 200 requests that each opened a
new connection were never stopped, because each machine keeps its own count and shares it "in the
background". A call site gets the first check only when its numbers equal the binding's on both
counts (`nativeFor`): a binding's `(limit, period)` is fixed at deploy and `limit({ key })` takes
only a key.

| Call site | First check | Count |
| --- | --- | --- |
| `/api/auth/**` — 30 per 60s | native (matches the `[[ratelimits]]` block) | D1 |
| `/api/health` — 60 per 60s | none | D1 |
| `mcp-connect-code` — 10 per 300s | none (`period` may only be 10 or 60) | D1 |

Caveats, all deliberate:

- **It fails open.** If D1 cannot be reached the request goes through, logged as
  `rate_limit_unavailable`. An outage in abuse control must not take sign-in down with it. A
  native binding that throws is ignored: the count still decides.
- **Every counted request is a D1 write.** That is the price of an exact count. The native first
  check keeps a flood on one connection from paying it; a flood from many connections is what a
  zone-level Cloudflare rate-limiting rule is for.
- **The window is fixed, not sliding:** `limit` at the end of one window plus `limit` at the start
  of the next.

This is front-door abuse control, not metering; anything you bill on belongs in a Durable Object.

To change the auth limit, change `NATIVE_LIMITER` in
[`server/utils/rate-limit.ts`](./server/utils/rate-limit.ts) **and** `simple` in `wrangler.toml`.
`test/rate-limit.test.ts` fails if the two ever drift.

---

## Bot protection (Cloudflare Turnstile)

A rate limit answers "how fast", never "is this a person". Turnstile is the other half:
[`server/utils/turnstile.ts`](./server/utils/turnstile.ts) exposes `requireTurnstile(event, token)`,
which throws a 400 carrying `data.code` (`turnstile_missing` or `turnstile_failed`) when the
challenge doesn't check out.

Wired on the two endpoints a stranger can reach:

| Endpoint | Notes |
| --- | --- |
| `POST /api/auth/magic-link` | Sign-in and sign-up. The challenge runs **first** — see below. |
| `POST /api/feedback` (anonymous) | Signed-in submissions skip it, which is both correct (they already cleared OAuth) and necessary: `useFeedback().submit()` is also called programmatically, with no widget on screen. |

**On the mint path the challenge runs before the per-address limiter is charged**, and that ordering
is the security property, not a style preference. That limiter is keyed by *somebody else's*
mailbox: a script that can spend it without solving a challenge locks a named victim out of their
own sign-in for the window, five requests at a time, without sending a single email. Put the
challenge second and the rate limit becomes the attack it was added to prevent. A test reads the
route's own source and fails if the two calls ever swap.

**Unset `NUXT_TURNSTILE_SECRET_KEY` and nothing happens** — no widget renders, no verification runs,
the form works exactly as before. Same posture as Resend. Setting *only*
`NUXT_PUBLIC_TURNSTILE_SITE_KEY` is the one bad state: the widget appears and nothing checks the
answer, so the server logs `turnstile_half_configured` rather than passing quietly. Both keys come
from dash.cloudflare.com → Turnstile → Add site.

Unlike the rate limiters, this one **fails closed**. They are advisory, so an outage lets traffic
through; a bot check that did the same would hand an attacker a bypass they could trigger on demand
by making `siteverify` slow.

`https://challenges.cloudflare.com` is in `script-src` and `frame-src` already, before anyone
configures a key — `test/security-headers.test.ts` asserts both. A CSP that only permits what today's config
happens to load breaks on the day someone pastes a key in, and it breaks as an empty box on a form.

**Limits keyed by something other than the caller need a different shape.** The magic-link
endpoint's per-address budget (5 per 15 min) does not use the `rateLimit()` wrapper, and that is the
point: the wrapper sets `X-RateLimit-Remaining` and throws 429, and keyed by *address* both of those
answer "is this stranger signing in right now?" for anyone willing to POST their email. It calls the
pure `consumeRateLimit()` instead, which sets no headers, and reports exhaustion as the same
`{ ok: true }` every other request gets. It charges two buckets — the exact address and the
canonical mailbox — because `victim+1@gmail.com` … `+9999` are thousands of strings that reach one
inbox, so a limiter keyed on the exact address is one an attacker steps around with a counter.
Identity stays on the exact address; see `canonicalizeEmailForLimiting` for why collapsing it there
would merge two strangers' accounts.

---

## Background work (cron tasks)

Nitro's task layer is on (`nitro.experimental.tasks`), and the `cloudflare_module` preset
already exports a `scheduled()` handler that runs cron tasks — so **no custom Worker entry
point is needed**, and none exists in this repo. The same is true of the queue consumer
above: it hooks `cloudflare:queue`, which that preset dispatches for you.

Adding a scheduled job is two edits plus a file:

1. `server/tasks/<name>.ts` exporting `defineTask({ meta, run })`
2. `nitro.scheduledTasks` in `nuxt.config.ts` — cron expression → task name
3. `[triggers] crons` in `wrangler.toml` — the **same** expression

> **Those two expressions must match verbatim.** The lookup is an exact string comparison,
> so `"0 4 * * *"` and `"0 04 * * *"` are different keys: Cloudflare fires on schedule,
> Nitro finds no task, and the handler returns success having done nothing. No error, no
> log line. If a task never runs, compare those two strings first.

The one task that ships is [`purge-expired-tokens`](./server/tasks/purge-expired-tokens.ts),
daily at 04:00 UTC. It deletes spent and expired `magic_link_tokens` older than a 24-hour grace
window — nothing in the request path ever deleted them, so the table grew forever with sign-ins.
The grace window is deliberate: a spent token is the only
evidence a link was replayed, and an expired one is what lets the verify page say "expired"
rather than "invalid". Each run deletes at most 5000 rows, so a long backlog drains
over several days instead of timing out forever on one enormous `DELETE`. The table carries
indexes on `expires_at` and `used_at` for this sweep: the `LIMIT` bounds rows *deleted*, not
rows *examined*, so without them the nightly job scanned the fastest-growing table in the
database and got slower as the product succeeded.

**It runs in `bun dev` too** — the dev preset drives the same map with croner, in-process. To
run it right now instead of waiting for 04:00, Nitro mounts a dev-only route:

```bash
curl https://my-app.localhost/_nitro/tasks/purge-expired-tokens
curl "https://my-app.localhost/_nitro/tasks/purge-expired-tokens?graceSeconds=0"
```

The DB logic lives in [`server/utils/purge.ts`](./server/utils/purge.ts) and takes `db` as an
argument, because Nitro skips scheduled tasks entirely under vitest — a test driving the task
wrapper would be testing the shim. [`test/purge.test.ts`](./test/purge.test.ts) drives the
util against a real D1 inside workerd.

Two files, one string, and nothing that checks — so something does now: `bun run crons:check`
(part of `bun run ci`) fails when the two lists differ in either direction, or when a scheduled
task name has no file under `server/tasks/`. The map lives once, as `SCHEDULED_TASKS` at the top
of `nuxt.config.ts`, and is handed to both `nitro.scheduledTasks` and `runtimeConfig.scheduledTasks`
so [`/api/status`](#fleet-contract-status-manifest-and-the-portfolio-dashboard) can report it.

The purge task also prunes the `ops_events` spool (see [Ops alerting](#ops-alerting) below).

---

## Ops alerting

Cloudflare cannot alert on Worker logs. Workers Logs has no notification hook, Log Explorer does
not carry `workers_trace_events`, and the Notifications catalogue has no usable Workers entry. So
the only component that both knows a request failed and can do something about it is the Worker
itself. It spools; the dashboard alerts.

- **The spool.** [`recordOpsEvent(db, { kind, detail, path })`](./server/utils/ops.ts) writes a
  row to `ops_events`. The error plugin calls it for every unhandled 5xx; call it yourself for
  anything else worth waking up for (a webhook whose signature failed, a money event that
  matched no account). It never throws and truncates `detail` to 500 characters — an alerting
  failure must not become the user's problem, and a stack trace is not an email.
- **The alert.** The app sends nothing. [`GET /api/fleet`](./server/api/fleet.get.ts) reports the
  last 24 h of the spool as `ops.kinds` (per kind: severity, count, newest row's `detail` and
  `path`), and the fleet dashboard, which already polls it every 15 minutes, is the only thing
  that mails you. The daily purge task prunes rows older than 7 days.
- **Severity.** [`server/utils/ops-severity.ts`](./server/utils/ops-severity.ts) tiers each kind
  `critical`, `warning` or `info`; unregistered kinds are warnings.
- **What it cannot catch** is the Worker failing to run at all: a broken deploy alerts nobody,
  because the thing that would alert you is the thing that is broken. That is what the portfolio
  dashboard's external poll of `/api/status` is for.

[`test/ops.test.ts`](./test/ops.test.ts) drives the spool against a real D1; the per-kind summary
is tested in [`test/fleet-status.test.ts`](./test/fleet-status.test.ts).

---

## Fleet contract (status, manifest, and the portfolio dashboard)

More than one app gets forked from this template, and a dashboard (`fleet` — itself a fork) watches
all of them. It needs three things from each app, and all three ship here so a fork has them the
moment it syncs.

### `fleet.json`

A manifest at the repo root that says what this app is: slug, display name, `stage`
(`live | built | dormant | unreleased | personal` — which decides whether zero traffic is an
outage or a Tuesday), every Worker the repo deploys, the D1/KV/R2 bindings with their ids, the
cron triggers, how it deploys, which template commit it last synced to, which optional modules it
kept (`features`), and the secret **names** production needs. Shape and field-by-field reasoning:
[`shared/utils/fleet-manifest.ts`](./shared/utils/fleet-manifest.ts).

It is only worth reading if it is true, so `bun run fleet:check` (part of `bun run ci`) fails the
build when it stops matching `wrangler.toml` — Worker name, binding names and ids, crons,
`NUXT_PUBLIC_APP_URL` — or still carries a `YOUR_…` placeholder outside
`stage: "unreleased"`. `bun run rename` rewrites it with everything else. Edit it in the same
commit as the wrangler change it describes.

### `GET /api/status` and `GET /api/fleet`

[`/api/status`](./server/api/status.get.ts) sits behind `Authorization: Bearer $NUXT_FLEET_TOKEN`
(404 with the token unset, 401 on a bad one) because build sha, migration tags and cron schedules
fingerprint the deployment. It carries no secrets:

```json
{
  "schema": 1, "status": "ok", "database": "connected",
  "app": { "slug": "my-app", "stage": "unreleased", "workers": ["my-app"] },
  "build": { "sha": "d0b2f48…", "date": "2026-08-22" },
  "versions": { "nuxt": "^4.5.2", "wrangler": "^4.125.0", "templateSyncedSha": null },
  "migrations": { "repo": { "head": "0013_…", "count": 14 }, "applied": { "table": "d1_migrations", "head": "0013_…", "count": 14 }, "pending": [], "unknown": [] },
  "crons": { "0 4 * * *": ["purge-expired-tokens"] }
}
```

`migrations.pending` is the field that earns the route its keep: it is every migration in the repo
that production has never applied — the deploy-before-migrate gap described in AGENTS.md ›
Gotchas, reported by the Worker the moment it opens instead of by a user. `status` is `degraded`
while it is non-empty, `down` (HTTP 503) when D1 is unreachable. `/api/health` is unchanged and
still the thing to point a dumb uptime check at.

[`/api/fleet`](./server/api/fleet.get.ts) is counters only — users, the
ops spool, the feedback queue — behind `Authorization: Bearer $NUXT_FLEET_TOKEN`. With the token
unset it **404s**, so an app that has not opted into the dashboard advertises nothing. Rotation
accepts `NUXT_FLEET_TOKEN_PREVIOUS` alongside the current one
([`server/utils/fleet-auth.ts`](./server/utils/fleet-auth.ts)). A fork adds its own numbers to
[`collectFleetCounters()`](./server/utils/fleet-status.ts)'s `extra` rather than inventing a
second route.

Both are allowlisted in [`server/middleware/auth.ts`](./server/middleware/auth.ts) — the session
guard must not 401 them before they answer.

### Ops alerting

The [spool above](#ops-alerting) is the third piece: the dashboard reads `ops.kinds` from
`/api/fleet`, and its email is how you hear about it when you are not looking at the dashboard.

---

## Transactional email

[`server/utils/email.ts`](./server/utils/email.ts) posts to Resend over plain `fetch` — no SDK, for
the same reason the PostHog helper has none. Swapping providers means editing one URL and body.

**It never throws.** Every call site is something more important than the email: a sign-in or a
request that must not fail because a mail API is down. Unset `NUXT_RESEND_API_KEY` and every
send becomes a logged no-op, so the template runs without a Resend account.

**It goes through a queue in production.** When the `EMAIL_QUEUE` producer binding exists,
`sendEmail()` hands the built request to Cloudflare Queues and returns; the consumer in
[`server/plugins/email-queue-consumer.ts`](./server/plugins/email-queue-consumer.ts) does the
Resend POST with retries, dead-lettering to `my-app-email-dlq` after four transient failures
(`max_retries = 3` counts retries, so a message is *delivered* up to four times).
That takes a third-party API call off the request path and turns a transient 503 from "the mail
is gone" into "the mail is late".

Things worth knowing:

- **`bun dev` always sends inline.** The dev server has a producer binding (miniflare provides
  one) but no consumer — the dev preset exports no `queue()` handler — so enqueueing there
  would be a black hole that reports success. `shouldUseEmailQueue()` refuses it explicitly.
- **The unconfigured check happens before the enqueue,** and if the enqueue itself fails the
  send falls back to an inline POST. Adding the queue cannot have made any call site less
  reliable than it was.
- **Two callers opt out with `inline: true`** — the magic-link endpoint, whose contract is
  "sent, or 503", and the feedback reply, which stamps `replied_at` on success. Queued,
  `sent: true` only means "accepted for delivery", which would make both of those lie.
- **A permanent rejection (any 4xx but 429) is acked, not retried.** It fails identically four
  times; the log line is `email_permanent_failure` with `dropped: true`. It never reaches the
  DLQ — acking is what keeps it out — and the DLQ is reserved for mail that might still be
  deliverable.
- **Both paths share one classifier**, so a given Resend status means the same thing whether it
  was delivered inline or from the queue, and both log the same two kinds
  (`email_permanent_failure` / `email_transient_failure`) with a `path` field.
- **Each POST carries `Idempotency-Key: <message id>`.** A queue message id is stable across
  redeliveries, so an attempt Resend accepted but we failed to observe — a timeout after the
  send, an isolate evicted before `ack()` — is deduplicated instead of delivered twice. It also
  makes re-driving the DLQ by hand safe.

`max_batch_timeout` is set to **1** second rather than the 30s default, because the magic-link
email is the one message a user is actively waiting on.

> **The dead-letter queue holds PII at rest.** A dead-lettered message is the whole rendered
> email, so `my-app-email-dlq` contains recipient addresses and full message bodies, readable by
> anyone with account access. The consumer never logs those; this queue stores them by design.
> Drain it rather than letting it accumulate, and remember it when answering a deletion request.

> **`compatibility_flags` pins `queue_consumer_wait_for_wait_until`, and that is load-bearing.**
> Nitro's `queue()` handler returns synchronously and only `waitUntil`s the hook, so every
> `ack()`/`retry()` runs after it returns — safe only because Cloudflare waits for `waitUntil`
> before acknowledging a batch. The opposite flag is experimental with no enable date, but if a
> future `compatibility_date` made it default, every batch would be acked immediately and
> `retry()` would silently become a no-op. Pinning the disable flag makes a date bump safe.

Which emails exist, and when they fire:

| Email | Trigger |
| --- | --- |
| Sign-in link | Every `POST /api/auth/magic-link`. The one email that is not optional — see Auth. |
| Welcome | First sign-in only |
| Activation nudge | Lifecycle task, for accounts that have not finished onboarding |
| Account deleted | Confirms a deletion |
| Feedback reply | An admin answers a feedback message |

**Unsubscribing takes a click, and that is not friction.** `List-Unsubscribe` is a URL sitting in
inbound mail, and mail security gateways GET every URL in a message on delivery — so a GET that
performed the opt-out let a corporate scanner unsubscribe people from mail they had asked for, with
nothing left behind but a preference row nobody set. `GET /api/email/unsubscribe` now authenticates
the token and redirects to the public `/unsubscribe` page whose button POSTs. Gmail and Yahoo's own
one-click button POSTs directly (RFC 8058), so the experience their bulk-sender rules are written
about is untouched.

They fire on **state transitions, not events**: emailing on every change teaches people to
filter you.


---

## Pages

| Route | Access | Notes |
| --- | --- | --- |
| `/` | Public | Landing page — hero, features, CTA. Indexed. |
| `/login` | Public | Magic-link form, then buttons for configured OAuth providers, then dev sign-in. `noindex`. |
| `/auth/verify` | Public | Where a magic link lands. Confirming is what spends the token. `noindex`. |
| `/unsubscribe` | Public | Where an email footer's unsubscribe link lands. Confirming is what opts you out — a GET must not, because mail gateways fetch it. `noindex`. |
| `/account` | Signed in | Email preferences, sign out everywhere, export and delete your data. |
| `/dashboard` | Signed in | The signed-in example. Replace with your product. |
| `/terms`, `/privacy` | Public | Templates written to match what this codebase actually does. **Have a lawyer read them.** |
| `/design-system` | Dev only | Stripped from the production route table in `nuxt.config.ts`. |

---

## Design system & brand mark

[`DESIGN.md`](./DESIGN.md) is the source of truth for how this app looks — colour, type, space,
motion, component behaviour, accessibility floors. It is written in the portable
[DESIGN.md](https://designmd.app/) format, so Claude Code, Codex, and Cursor all read it
directly. Two things compile out of it, and neither should ever be hand-edited:

| Command | Reads | Writes |
| --- | --- | --- |
| `/design-sync` | DESIGN.md (colour, type, space, components) | `app/assets/css/main.css`, `app/app.config.ts` |
| `/logo-sync` | DESIGN.md › Brand mark | `app/components/Brand/Logo.vue` |
| `bun run brand:generate` | that component + the colour roles in DESIGN.md | `public/favicon.svg`, `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/og.png`, `shared/utils/brand-colors.generated.ts`, `brand.lock.json` |

The mark is drawn **once**, in a Vue component, and everything else is cut from it. That is the
whole trick: a favicon, a home-screen icon, and a share image maintained as three separate
files is three chances to redesign one of them and forget the others, and nothing ever fails
when you do. Here the header renders the same `<svg data-brand-mark>` element the icons are
generated from, and `bun run brand:check` — part of `bun run ci` — fails the build when the
generated files stop matching it.

Rasterising uses the Chromium that Playwright already installs for the accessibility suite, so
there is no new dependency and `og.png` is composed in the same engine, with the same webfonts,
that renders the site. It needs a network connection for those fonts; offline it still produces
correct assets and tells you it fell back.

Two gates keep app code inside the system: `bun run design:check` fails on anything that
bypasses the token layer (a numbered colour scale, a raw hex, a suppressed focus ring), and
`bun run test:a11y` runs axe in a real browser over every public route in both colour modes.
That script also runs the Content-Security-Policy spec (`test/csp/`) and the E2E suite (`test/e2e/`,
see Testing above) in the same browser — it is the browser gate, not only the accessibility one.
The dev-only `/design-system` route renders every token, component state, and generated brand
asset on one page — that is where you verify a change actually landed.

Forking? Replace everything below the Identity heading in `DESIGN.md` (or drop in one from
[designmd.app](https://designmd.app/)), run `/design-sync`, then `/logo-sync`. A fork that would
rather hand-author its icons can drop `brand:check` from the `ci` script.

The pipeline also produces `GET /manifest.webmanifest` — a Nitro route, not a static file,
because `name`/`description` need to follow `NUXT_PUBLIC_APP_NAME`/`NUXT_PUBLIC_APP_DESCRIPTION`
per fork and per environment. It links `public/icon-192.png` and `public/icon-512.png` (both
generated maskable-safe, same square-ground treatment as the apple-touch icon) and sets
`theme_color`/`background_color` from `shared/utils/brand-colors.generated.ts` — resolved from
DESIGN.md › Brand mark › Color roles at `bun run brand:generate` time, since a manifest has no
color mode either. `<link rel="manifest">` is in `nuxt.config.ts` › `app.head.link`. This is
what makes "Add to Home Screen" install the real icon and name instead of a generic tile.

---

## SEO & AEO

Classic SEO is about being **findable**. Answer engines — AI Overviews, ChatGPT Search,
Perplexity — are about being **quotable**: they need to extract, without guessing, what the
product is, who runs it, what it costs. Prose gets paraphrased wrongly; a typed graph doesn't.
Both halves are wired here, and both are enforced by CI.

### One call per page

Every page calls [`useSeo()`](./app/composables/useSeo.ts) exactly once. It emits the four
things that have to happen together, three of which are easy to forget:

| | Why it's in the wrapper |
| --- | --- |
| `<link rel="canonical">` | `useSeoMeta()` does **not** emit one. On Workers the same app answers on `*.workers.dev` *and* your custom domain — without a canonical you publish two spellings of every page and split the ranking. |
| Open Graph + Twitter | With an **absolute** `og:image`. Relative ones are dropped by most unfurlers, so a share renders as bare text. |
| JSON-LD | The `@graph` an answer engine actually reads — see below. |
| `noindex` | Per-page, plus globally on preview deploys. |

```ts
useSeo({
  title: 'About',                          // `· My App` is appended for you
  description: 'What this is …',
  breadcrumb: [{ name: 'About', path: '/about' }],
  schema: [softwareApplicationSchema(site, { … })],
})
```

### Public pages declare themselves

```ts
definePageMeta({
  publicPage: { changefreq: 'weekly', priority: '0.8', title: 'About', summary: '…' },
})
```

That single declaration is what puts a page in **both** `sitemap.xml` and `llms.txt`. There is
no list to keep in sync — the previous version of this template had a hardcoded array in the
sitemap route, and a hardcoded array is a second place to remember. Add `/changelog`, ship it,
and it was simply never in the sitemap, with nothing failing.

A page without the key is in neither, which is the right default: most pages added to an app
are private. Dynamic routes are one pattern, not N URLs, so the collecting hook skips any path
containing `:`. Data-driven pages (public profiles, a catalogue) are enumerated by a query inside
[`sitemap.xml.get.ts`](./server/routes/sitemap.xml.get.ts) instead. Such a page still declares
`publicPage`, because `seo:check` enforces "indexable ⇔ declared public" across every page; the
declaration is inert as a sitemap entry and says so in a comment.

`<lastmod>` is the **build date** for static pages, not the request date. `new Date()` at
request time tells crawlers every page changed today, on every fetch, and they discount a
lastmod that always says "now".

### Structured data

Builders live in [`shared/utils/schema.ts`](./shared/utils/schema.ts) as pure functions, so
their shapes are unit-testable without booting Nuxt. Nodes are linked by `@id` rather than
duplicated — one `Organization`, one `WebSite`, everything else pointing at them — which is
what lets a consumer resolve "this page" and "this company" to single entities.

`/` carries `SoftwareApplication`. The rule worth keeping:

- **Never describe something in JSON-LD that isn't on the page.** FAQ markup without a visible
  FAQ is a manual-action risk with Google, so structured data is built from the same source the
  page renders.

### The three crawler files

All generated at [`server/routes/`](./server/routes/) rather than dropped in `public/`, so they
can use the real deployment origin:

- **`robots.txt`** — names every AI crawler explicitly (GPTBot, ClaudeBot, PerplexityBot,
  Google-Extended, …) instead of leaving them to `User-agent: *`. Not because the default is
  wrong, but because a policy you can read is a policy you can change. Defaults to allowing
  them: for a SaaS marketing site, being quotable is distribution, not theft. Flip with
  `NUXT_PUBLIC_ALLOW_AI_CRAWLERS=false`.
- **`sitemap.xml`** — derived from the route table, as above, plus any data-driven sources an app registers.
- **`llms.txt`** — the [llmstxt.org](https://llmstxt.org) convention: a short Markdown map of
  the site for a model with limited context and no patience for navigation. A map, not a
  mirror — every line is a link plus one sentence, built from the same `publicPage`
  declarations, so it can't drift.

Set `NUXT_PUBLIC_INDEXABLE=false` on preview deploys: robots.txt disallows everything, every
page renders `noindex`, sitemap.xml goes empty and llms.txt 404s. An indexed preview URL
competes with production for the same content.

If a data-driven source query fails, sitemap.xml and llms.txt still serve — a document missing
entries beats a 500 — but they switch to `Cache-Control: no-store`, so a momentary D1 blip is not
cached for an hour as the truth. Suppression is different from degradation: an empty preview
sitemap is a deliberate, stable answer and stays cacheable.

### The gate

```bash
bun run seo:check
```

Part of `bun run ci`. The SEO layer is only a contract if something enforces it, and its
failure mode is the worst kind: nothing throws, the page renders, and you find out from a
traffic graph months later. The gate fails the build on a page that skips `useSeo()`, calls
`useSeoMeta()`/`useHead()` behind its back, is indexable but undeclared (or `noindex` *and*
declared), has a missing or badly-sized description, or has more than one `<h1>`. Escape hatch
is `seo-check-ignore`, same as the design-token gate.

`public/og.png` is generated, not hand-made: `bun run brand:generate` composes it from the brand
mark, the DESIGN.md colours, and the app name in `wrangler.toml`. So the fix for a share image
that still says "My App" is to rename the project and re-run that command — and `bun run
brand:check` fails the build until you do. See [Design system & brand mark](#design-system--brand-mark).

The legal pages are the part people skip and then get stuck on. The ones here name the actual
processors this app ships with (Cloudflare, PostHog, Resend) and describe the real behaviour.
They are still a starting point, not legal advice, and each carries a banner saying so until you
remove it.

---

## Feedback loop

PostHog (wired in [`app/plugins/posthog.client.ts`](./app/plugins/posthog.client.ts)) tells you what users **did** — autocapture, session replay, exceptions, heatmaps, dead clicks, web vitals, all proxied same-origin through `/ingest` so ad blockers can't drop it. Empty `NUXT_PUBLIC_POSTHOG_KEY` = the whole thing no-ops.

This section is the other half: what users **said**.

### The widget

`<FeedbackWidget />` is mounted once in [`app/layouts/default.vue`](./app/layouts/default.vue), so every page has a floating trigger. Drop `<FeedbackWidget position="inline" />` into a page instead (end of onboarding, account page, cancellation flow) if a floating button doesn't suit the product.

It's open to **signed-out visitors on purpose** — requiring a login before someone can tell you something is the fastest way to hear nothing. `POST /api/feedback` is allowlisted by the global auth middleware (the full allowlist is in [`.claude/docs/auth.md`](./.claude/docs/auth.md)); reading and triaging stay gated. The PostHog event carries the feedback id, kind, rating, path and replay link — never the message text; the D1 row is the system of record.

### What one submission produces

1. **A row in the `feedback` table (D1)** — yours forever, joinable against `users`, and it survives dropping PostHog. Carries the kind, message, route, optional reply-to email, optional 1–5 rating, and a deep link to the PostHog session replay of that exact moment.
2. **A PostHog `feedback_submitted` event** on the submitter's distinct id, so the note lands on their person timeline next to the replay. Capture is **server-side only** — the client passes the replay URL and distinct id but never captures, so a blocked SDK can't lose the event and it can't be double-counted.

Abuse control: 5 submissions per hour per source, counted against a salted SHA-256 of the IP (`ip_hash`) — enough to rate-limit, useless as an identifier.

### Reading the queue

- `GET /api/feedback?status=new&limit=50` — admin-only list. Admin means `users.role = 'admin'` in D1 (`requireAdmin()` in [`server/utils/admin.ts`](./server/utils/admin.ts)), not a session claim — grant it with `UPDATE users SET role = 'admin' WHERE email = '…';`
- `PATCH /api/feedback/<id>` — mark `triaged`/`closed` and link the GitHub issue it became.
- The [`feedback-triage`](./.claude/routines/feedback-triage.md) routine (ships disabled, like all routines) reads new rows daily over `wrangler d1 execute --remote`, files bugs and ideas as labelled GitHub issues, and escalates anything angry, legal, or security-shaped instead of publishing it. Feedback text is untrusted input — the routine is instructed accordingly.

### Asking, not just listening

The widget is for **unsolicited** feedback. For **solicited** feedback — NPS, CSAT, "why did you cancel?" — use PostHog Surveys: create one in the PostHog dashboard and it just works, because `posthog-js` fetches survey config and `surveys.js` through the same `/ingest` proxy. No code change, no deploy.

For prompts you want to own end-to-end, call the composable directly and the answer lands in your own table:

```ts
const { submit } = useFeedback()
await submit({ kind: 'other', message: reason, rating: 2 })
```

---

## Claude Code setup

This template ships with Claude Code configuration out of the box:

- **MCP servers** (`.mcp.json.example`, copied to a local gitignored config by `bun dev`): Cloudflare docs, NuxtUI docs, Drizzle schema introspection, Nuxt live introspection, GitHub
- **Slash commands** (`.claude/commands/`): `/new-feature`, `/scaffold-component`, `/scaffold-api`, `/db-migrate`
- **Skills** (`.claude/skills/`): NuxtUI, frontend design, theming, and more
- **AI guide** (`AGENTS.md`): stack conventions, styling rules, commands, and an index into `.claude/docs/` — kept small on purpose, since it loads into every agent session
- **Subsystem docs** (`.claude/docs/`): auth, email, SEO, patterns, brand, agent tooling, and the gotchas list — read on demand, not all at once

The Nuxt MCP server requires `bun dev` to be running — its URL in the MCP config is `https://<your-portless-name>.localhost/__mcp/sse` (defaults to `my-app`; rename when you fork). Everything else works without any extra setup.

// https://nuxt.com/docs/api/configuration/nuxt-config
import { execSync } from 'node:child_process'

import { useNitro, useNuxt } from '@nuxt/kit'

import { securityHeaders } from './shared/security-headers'
import type { PublicPage } from './shared/utils/site'

// ─── Scheduled tasks ─────────────────────────────────────────────────────────
//
// Cron expression → task names. This map is the ONLY thing that connects a
// Cloudflare cron trigger to a task, and the join is an exact string match on
// the expression, so every key here must appear verbatim in `[triggers] crons`
// in wrangler.toml. A mismatch is silent: the Worker wakes on schedule and does
// nothing. `bun run crons:check` fails the build on one.
//
// Hoisted to a const so it can be handed to BOTH `nitro.scheduledTasks` (what
// runs) and `runtimeConfig.scheduledTasks` (what /api/status reports) — one
// map, so the dashboard compares the schedule Nitro will honour against the
// triggers Cloudflare says it registered.
//
//   04:00 UTC  — retention sweep, server/tasks/purge-expired-tokens.ts, which also
//                prunes the ops_events spool (7 days); then the IndexNow ping,
//                server/tasks/seo/indexnow.ts. The template's lifecycle email
//                is left out on purpose: it nudges people who have not
//                "finished setting up", and this product sends no nudges.
//   every 15 m — mail release, layers/post/server/tasks/release-mail.ts: each
//                mailbox takes delivery at its own local hour.
const SCHEDULED_TASKS: Record<string, string[]> = {
  '0 4 * * *': ['purge-expired-tokens', 'seo:indexnow'],
  '*/15 * * * *': ['release-mail'],
}

/**
 * The commit this build came from, for /api/status. Workers Builds exports
 * WORKERS_CI_COMMIT_SHA and GitHub Actions GITHUB_SHA; a local build asks git.
 * Empty when none of those is available (a tarball, a shallow copy with no
 * .git) — reported as null by the route rather than guessed.
 */
function buildSha(): string {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (fromCi) return fromCi
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

export default defineNuxtConfig({
  // Nuxt 4 compatibility
  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    'nuxt-auth-utils',
    // nuxt-mcp rewrites the local MCP config (untracked, copied from `.mcp.json.example`) with the live dev
    // server URL every time a dev server boots. Helpful when you started that
    // server yourself; destructive in automation, because `bun run test:a11y`
    // boots one too. An agent or CI run would finish with a dirty tree, and a
    // `git add -A` would sweep a throwaway port into the commit, clobbering the
    // `my-app.localhost` URL that `bun run rename` is responsible for.
    //
    // Gated on the same signal the a11y suite already sets. Options go in the
    // array form because nuxt-mcp registers `configKey: 'mcp'` without
    // augmenting `@nuxt/schema`, so a top-level `mcp:` key would not typecheck.
    ['nuxt-mcp', { updateConfig: process.env.NUXT_DEVTOOLS === 'false' ? false : 'auto' }],
    // Cloudflare Turnstile. Registered with no options on purpose: the module's
    // own defaults hand `nuxt dev` Cloudflare's always-passing TEST keys, and
    // the explicit empty `turnstile` entries in runtimeConfig below override
    // them (defu keeps a value already present on the config). So the template
    // renders no widget and verifies nothing until a real key is set — the same
    // "runs without an account" posture as Resend and Stripe, and identical in
    // dev and production rather than only in one of them.
    //
    // Expect one build-time warning, "No site key was provided." That is the
    // module telling you which env var to set; a template that ships without a
    // Turnstile account cannot make it go away without pretending to have one.
    '@nuxtjs/turnstile',
  ],

  // NuxtUI v4 requires this CSS entry — without it, Tailwind utilities and
  // NuxtUI semantic tokens (text-foreground, bg-background, etc.) won't apply
  // and pages render unstyled. See app/assets/css/main.css.
  css: ['~/assets/css/main.css'],

  // Document-level defaults every page inherits.
  app: {
    head: {
      // Nuxt does not set this for you. Without it, screen readers guess the
      // pronunciation and translation tools guess the source language — and
      // Google treats a missing lang as a weak signal about who the page is for.
      htmlAttrs: { lang: 'en' },
      // viewport-fit=cover is what makes env(safe-area-inset-*) resolve to
      // anything but 0 on iOS — the `bottom-safe` / `right-safe` utilities in
      // main.css are inert without it (DESIGN.md › Accessibility › Viewport).
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      // Deliberately no `theme-color`: the correct value is the page
      // background, which lives in the token layer and differs per color mode.
      // Hardcoding a hex here would bypass DESIGN.md and be wrong in the dark.
      //
      // manifest.webmanifest's own `theme_color` is not the same decision
      // reversed. A manifest has no color mode either — same as a PNG — so it
      // isn't picking a light-vs-dark value out of the token layer; it's
      // reading DESIGN.md › Brand mark › Color roles (`manifest-theme`,
      // resolved at `bun run brand:generate` time, same pipeline as the
      // icons) the one time a fixed brand color is actually correct: the
      // launcher chrome Android paints once this is installed as an app.
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  // NuxtHub — Cloudflare D1, KV, R2, and Blob bindings
  hub: {
    db: 'sqlite', // D1 SQLite via Drizzle (auto-imports `db` and `schema` in server routes)
    kv: true, // KV store
    blob: true, // R2 object storage
    // Cache layer, for `defineCachedFunction` / `defineCachedEventHandler`.
    //
    // The binding is named explicitly, and that is a bug fix rather than a
    // preference. `cache: true` on Cloudflare resolves to a KV binding called
    // `CACHE`, which this template's wrangler.toml does not declare — so every
    // cache read and write threw `Invalid binding 'CACHE': 'undefined'`.
    // Nitro catches those, so nothing broke loudly: the cache simply never
    // stored anything, while logging two errors per request into Cloudflare
    // Logs and, via the error plugin, into PostHog as `server_error`. Observed
    // directly against `wrangler dev` on the built Worker.
    //
    // Pointing it at the `KV` namespace that already exists costs a fork
    // nothing — no second namespace to create, no second placeholder id in
    // wrangler.toml. Sharing is safe: Nitro prefixes its entries with
    // `cache:`, which nothing else in this app writes.
    cache: { driver: 'cloudflare-kv-binding', binding: 'KV' },
  },

  // NuxtUI v4 + Tailwind v4
  ui: {
    // Customize your design system here
    // colors: { primary: 'blue', neutral: 'slate' }
  },

  // TypeScript — follow Vite/Nuxt recommended defaults.
  //
  // typeCheck runs vue-tsc in-process on `nuxt dev`. The a11y suite's dev server
  // sets NUXT_TYPECHECK=false to skip it: `bun run ci` has already run
  // `bun run typecheck` by that point, so doing it again just puts vue-tsc in
  // competition with the cold Vite build for the same CI runner.
  typescript: {
    strict: true,
    typeCheck: process.env.NUXT_TYPECHECK !== 'false',
  },

  // Icons — DESIGN.md › Identity › Iconography. Every setting here exists so
  // that rendering an icon never leaves this origin. The collection itself is
  // the @iconify-json/lucide devDependency.
  //
  // clientBundle: each i-lucide-* literal the scanner finds is inlined into
  // the client bundle, which SSR consults first. The scanner skips .ts by
  // default (a performance default, not a limit), but some icon names are
  // data — app/utils/admin.ts, server/utils/auth-providers.ts — rendered by
  // `:icon` / `<UIcon :name>`. Unbundled, each of those costs one server-side
  // `[Icon] failed to load icon lucide:*` per render and one browser round
  // trip to /api/_nuxt_icon/lucide.json. Scanning the source trees' .ts too
  // means there is no hand-kept list to drift. Prose that happens to look
  // like `ci-browser` is matched, unresolvable, and silently skipped — only
  // a hand-listed `clientBundle.icons` entry can fail the build.
  //
  // serverBundle: `auto` resolves to `remote` on the cloudflare_module preset,
  // so the Worker answered /api/_nuxt_icon by fetching whole collections from
  // cdn.jsdelivr.net at request time. Bundling lucide (+81 kB gzip) makes
  // the endpoint self-contained. Not `'local'`: that takes every installed
  // @iconify-json/* package, and a fork with @iconify-json/logos measured
  // 3.38 MB gzip — over the 3 MB Worker limit on the free plan.
  //
  // fallbackToApi off: with lucide bundled, a miss means a collection that is
  // not installed. The default answers that with a fetch to api.iconify.design
  // — from the Worker, and from the browser too — which hides the mistake
  // behind a third-party request. A warning is the better failure.
  icon: {
    clientBundle: {
      scan: {
        // The module's own defaults, plus the source trees' .ts files.
        globInclude: ['**/*.{vue,jsx,tsx,md,mdc,mdx,yml,yaml}', '{app,server,shared}/**/*.ts'],
      },
    },
    serverBundle: { collections: ['lucide'] },
    fallbackToApi: false,
  },

  // DevTools. Disabled when NUXT_DEVTOOLS=false, which the a11y suite sets:
  // the devtools panel injects its own markup into every page, and axe would
  // scan it and report violations that aren't in this app's code.
  devtools: { enabled: process.env.NUXT_DEVTOOLS !== 'false' },

  experimental: {
    // Teach Nuxt's build-time definePageMeta scanner about our own key, so the
    // `pages:resolved` hook below can read it. Without this the key is dropped
    // during extraction and every page looks private.
    extraPageMetaExtractionKeys: ['publicPage'],
  },

  hooks: {
    // /design-system is the dev-only style guide (app/pages/design-system.vue)
    // used to verify DESIGN.md changes actually landed. Strip it from the
    // production route table so it never ships to users.
    'pages:extend'(pages) {
      if (process.env.NODE_ENV !== 'production') return
      const index = pages.findIndex((page) => page.path === '/design-system')
      if (index !== -1) pages.splice(index, 1)
    },

    // Derive sitemap.xml and llms.txt from the route table rather than from
    // hand-kept lists inside the Nitro routes. Pages opt in with
    // `definePageMeta({ publicPage: … })` (app/types/seo.d.ts); anything
    // without that key is absent from both, which is the right default because
    // most pages added to an app are private.
    //
    // Three details this depends on, all of them easy to get subtly wrong:
    //
    //   * `pages:resolved`, not `pages:extend`. Nuxt statically extracts
    //     definePageMeta *between* the two hooks, so `page.meta` is still null
    //     in `pages:extend` — the earlier hook sees every page as unmarked.
    //   * `experimental.extraPageMetaExtractionKeys` above. Without it the
    //     extractor ignores `publicPage` and records only a "there was a
    //     dynamic key here" marker, so this hook silently collects nothing.
    //   * Nitro is already initialised by the time this runs, so setting
    //     `nuxt.options.runtimeConfig` alone is too late — the value is read
    //     from the Nitro instance. Both are set below.
    //
    // Each of those fails by producing an *empty* sitemap rather than an error,
    // which is why test/seo.test.ts asserts the rendering and `bun run ci`
    // builds. If the sitemap ever goes empty, start here.
    'pages:resolved'(pages) {
      const entries: PublicPage[] = []
      const collect = (list: typeof pages) => {
        for (const page of list) {
          // Build-time page meta is typed `unknown` per key; app/types/seo.d.ts
          // declares this key's shape for `definePageMeta`.
          const meta = page.meta?.publicPage as Omit<PublicPage, 'path'> | undefined
          // Dynamic segments have no single URL to publish — a route like
          // /posts/[id] is one pattern, not N pages. Those need a D1 query in
          // server/routes/sitemap.xml.get.ts, not a route-table entry.
          if (meta && page.path && !page.path.includes(':')) {
            entries.push({ path: page.path, ...meta })
          }
          if (page.children?.length) collect(page.children)
        }
      }
      collect(pages)
      entries.sort((a, b) => a.path.localeCompare(b.path))

      useNuxt().options.runtimeConfig.publicPages = entries
      useNitro().options.runtimeConfig.publicPages = entries
    },
  },

  // Runtime config — public vars go in public, secrets stay private
  runtimeConfig: {
    // Server-only secrets (access via useRuntimeConfig().mySecret)
    // NUXT_SESSION_PASSWORD: the app's own salt and signing key (unsubscribe
    // links, IP and search hashes). Sessions no longer
    // use it: nuxt-auth-utils seals them with a key derived from Nuxt's
    // `appSecret` (NUXT_APP_SECRET). Its startup warning that this variable "is
    // not used anymore" is about the module, not this app; changing the value
    // breaks every link and hash made with it.
    sessionPassword: '',
    // Capture the `user_signed_out` analytics event on POST /api/auth/logout.
    // On by default; an app that collects less analytics sets it to false
    // (NUXT_CAPTURE_SIGN_OUT=false works too).
    captureSignOut: true,
    // Absolute cookie lifetime, in seconds. Without it nuxt-auth-utils seals
    // with no TTL and a leaked cookie stays valid until the account is deleted —
    // `sessions_invalid_before` is the per-user revocation lever, this is the
    // ceiling on how long any session can live at all. 30 days: a consumer
    // re-signs in monthly via the magic link, which is the whole cost.
    // The clock restarts on every session write: sign-in, signing out other
    // devices, and a password change. Ordinary requests never write one.
    session: { maxAge: 60 * 60 * 24 * 30 },
    // Filled by the `pages:resolved` hook above from
    // `definePageMeta({ publicPage })`. Server-only: sitemap.xml and llms.txt
    // are the only readers, so it stays out of the client bundle.
    publicPages: [] as PublicPage[],
    // Stamped at build time and used as <lastmod> for every sitemap URL.
    // Per-page dates would be better, but the honest source for those is git
    // history, which CI clones shallowly — a plausible-looking wrong date is
    // worse than a coarse right one, and crawlers discount lastmod that always
    // says "today", which is what `new Date()` at request time produces.
    buildDate: new Date().toISOString().slice(0, 10),
    // The cron map Nitro runs, exposed so /api/status can report it. Server-only.
    scheduledTasks: SCHEDULED_TASKS,
    // ── Fleet (the portfolio dashboard) ─────────────────────────────────────
    // Bearer the dashboard presents to /api/fleet. Unset = that route 404s, so
    // an app that has not opted in advertises nothing. 32+ characters; generate
    // with `openssl rand -base64 32` and set via `wrangler secret put
    // NUXT_FLEET_TOKEN`. `_PREVIOUS` is only set during a rotation — see
    // server/utils/fleet-auth.ts for the three-step.
    fleetToken: '',
    fleetTokenPrevious: '',
    // Bearer the ops-triage routine presents to GET /api/ops/events. Unset = that
    // route 404s. Its own secret, not the fleet token: different consumer, rotated
    // separately. `wrangler secret put NUXT_OPS_TOKEN`; 32+ characters.
    opsToken: '',
    // IndexNow key, 8–128 of [A-Za-z0-9-] (`openssl rand -hex 16`). Not a secret:
    // /indexnow-key.txt serves it so Bing can verify submissions. Set as
    // NUXT_INDEXNOW_KEY in wrangler.toml [vars]. Empty = the daily seo:indexnow
    // task and the key route both no-op. See server/utils/indexnow.ts.
    indexnowKey: '',
    // OAuth providers, read by nuxt-auth-utils' defineOAuth*EventHandler.
    // Declared here (rather than left implicit) so /api/auth/providers can tell
    // the login page which buttons to render — an unconfigured provider dead-ends
    // in a "missing configuration" error instead of a sign-in.
    // Set via NUXT_OAUTH_GITHUB_CLIENT_ID etc.
    //
    // All of these are optional. The primary sign-in path is the magic link
    // (server/api/auth/magic-link.post.ts), which needs no provider at all —
    // only Resend, below. GitHub in particular ships unconfigured on purpose:
    // it is a developer credential, and a consumer sign-in page that leads with
    // it is telling most of its visitors the product isn't for them.
    oauth: {
      // Apple's client secret is an ES256 JWT signed per request, so the config
      // is four values rather than two: `clientId` is the Services ID, and
      // `privateKey` is the .p8 contents with literal newlines written as \n.
      // A real secret — `wrangler secret put`, never wrangler.toml [vars].
      //
      // `redirectURL` is the fifth, and it is REQUIRED for Apple specifically —
      // the only provider here that needs one. nuxt-auth-utils' Apple handler
      // puts the raw value into the token-exchange body instead of falling back
      // to the request's own origin the way the Google and GitHub handlers do,
      // so leaving it empty sends `redirect_uri=undefined` to Apple and the
      // sign-in dies with `invalid_grant` at the very last step. Set
      // NUXT_OAUTH_APPLE_REDIRECT_URL to exactly the Return URL registered with
      // Apple: https://<your-app>/api/auth/apple
      apple: { clientId: '', teamId: '', keyId: '', privateKey: '', redirectURL: '' },
      google: { clientId: '', clientSecret: '' },
      github: { clientId: '', clientSecret: '' },
    },
    // Cloudflare Turnstile (server/utils/turnstile.ts). Set via
    // NUXT_TURNSTILE_SECRET_KEY — the name @nuxtjs/turnstile reads, not one we
    // chose. Empty = requireTurnstile() skips verification, so the template runs
    // without a Turnstile account.
    //
    // Declared here rather than left to the module because the module's dev
    // default is Cloudflare's always-passing test secret, and a challenge that
    // always passes is worse than no challenge: it looks like protection in dev
    // and is not protection anywhere.
    turnstile: {
      secretKey: '',
    },
    // Which queue the email consumer owns, set by NUXT_EMAIL_QUEUE_NAME in
    // wrangler.toml's [vars] — and again, with a different value, in
    // [env.preview.vars].
    //
    // It is configuration rather than a constant precisely because those two
    // values differ. A constant is baked into the bundle once, so it matched
    // the production queue and silently failed to match the preview one; the
    // consumer then returned without acking, which acks the batch by omission,
    // and every preview email disappeared. See shouldHandleQueue().
    //
    // Empty here on purpose: the default must not be a stale `my-app-email`
    // that survives `bun run rename`. Unset means "accept every batch", which
    // for a Worker with one consumer is the safe direction to fail.
    emailQueueName: '',
    // Transactional email (server/utils/email.ts). Empty key = no-op, so the
    // template runs without a Resend account.
    resend: {
      apiKey: '',
      // Must be an address on a domain you've verified in Resend, e.g.
      // "My App <hello@myapp.com>". Anything else is rejected at send time.
      from: '',
    },
    // Public vars (access via useRuntimeConfig().public.myVar)
    // NUXT_PUBLIC_APP_NAME in wrangler.toml [vars] overrides this at runtime
    public: {
      // Password and passkeys are the only sign-in (layers/credentials). `prf`
      // asks a passkey for the secret that opens letters without a password.
      credentials: { enabled: true, primary: true, prf: true },
      // What the service worker shows when a page cannot load (layers/pwa).
      pwa: {
        offlineTitle: 'The post is not getting through',
        offlineBody: 'Your mantel needs a connection. Check yours, then try again.',
      },
      // The product's own name, so dev and the browser suites (which never load
      // [vars]) match production; another instance sets NUXT_PUBLIC_APP_NAME.
      appName: 'Dear Mantel',
      // Stamped at build time; /api/status reports it so a dashboard can tell
      // which commit is live. Public because a sha is not a secret and a
      // footer may want to show it.
      buildSha: buildSha(),
      // One sentence describing the product. Used as the landing page's meta
      // description, as the blockquote in /llms.txt, and as the schema.org
      // description — so an answer engine reads the same claim everywhere
      // rather than three paraphrases it has to reconcile.
      appDescription:
        'A full-stack SaaS template on Nuxt 4 and Cloudflare Workers: auth, email, and analytics already wired together.',
      // PostHog — paste your project's phc_… key here (or set
      // NUXT_PUBLIC_POSTHOG_KEY in env). Public-by-design; ships in the
      // client bundle. Empty key = plugin no-ops, nothing tracked.
      posthogKey: '',
      posthogHost: 'https://us.i.posthog.com',
      // The app's canonical public origin, no trailing slash. Absolute links in
      // emails, sitemap.xml, robots.txt, and og: tags are built from this —
      // there is no request context in a webhook to infer it from.
      appUrl: 'http://localhost:3000',
      // The MCP worker's public origin (mcp/). Its endpoint, the same URL with
      // `/mcp` on the end, is read as the same server (`mcpOrigin()`).
      // Set as NUXT_PUBLIC_MCP_URL once the worker is deployed. It puts the
      // server's address on /account, in llms.txt, and in
      // /.well-known/ai-catalog.json. Empty = the app advertises no MCP server.
      // `bun run mcp:check` holds it equal to mcp/listing.json › url.
      mcpUrl: '',
      // Set false on preview deploys so robots.txt disallows everything, every
      // page renders `noindex`, and an ephemeral URL never competes with
      // production in the index.
      indexable: true,
      // Whether AI crawlers and answer-engine fetchers (GPTBot, ClaudeBot,
      // PerplexityBot, Google-Extended, …) may read the public pages.
      //
      // Default true, and deliberately so: for a SaaS marketing site, being
      // quotable by an answer engine is distribution, not theft — these are the
      // crawlers behind ChatGPT Search, Perplexity, and AI Overviews. Set false
      // (NUXT_PUBLIC_ALLOW_AI_CRAWLERS=false) if your public content is the
      // product rather than an advert for it. Either way it is a decision you
      // made, which is the point of the flag.
      allowAiCrawlers: true,
      // Cloudflare Turnstile site key (public by design — it identifies the
      // widget, it does not authorise anything). Set via
      // NUXT_PUBLIC_TURNSTILE_SITE_KEY, the name @nuxtjs/turnstile reads.
      //
      // Empty = <NuxtTurnstile> is never rendered and no challenge script is
      // fetched. Components gate on this value, not on the module being
      // installed, so an unconfigured fork ships zero Turnstile bytes.
      turnstile: {
        siteKey: '',
      },
      // Shown on /terms and /privacy and used as the Reply-To on transactional
      // email. A legal page with no way to reach a human is not a legal page.
      supportEmail: 'support@example.com',
      // Legal entity named in /terms and /privacy. Your company, not your app.
      legalEntity: 'My Company Ltd',
      // The organization's own profiles elsewhere (GitHub, X, LinkedIn, a
      // Wikidata item), emitted as Organization.sameAs. It is how a search engine
      // tells your entity apart from another with the same name. Empty = omitted.
      // Env: NUXT_PUBLIC_SAME_AS='["https://github.com/you"]' (parsed as JSON).
      sameAs: [] as string[],
    },
  },

  // Security headers on every response — see the block above nuxt.config's
  // default export for how each CSP source was verified.
  //
  // '/**' rather than a page-only pattern on purpose. The headers are inert on
  // JSON (a CSP does not apply to a fetch response body), so scoping would buy
  // nothing, while the two that DO matter off-document — nosniff on
  // /og.png and HSTS on every API call — are exactly the ones a narrower
  // pattern would drop. It also means a route added later is covered by
  // default rather than by remembering to come back here.
  routeRules: {
    '/**': {
      headers: securityHeaders(process.env.NODE_ENV !== 'production'),
    },
  },

  // Nitro — Cloudflare Workers preset for production build
  nitro: {
    preset: 'cloudflare_module',
    experimental: {
      // Turns on Nitro's task layer: server/tasks/ is scanned, `defineTask` is
      // auto-imported, and `import.meta._tasks` becomes true — which is the
      // flag the cloudflare_module preset's `scheduled()` handler checks before
      // it calls runCronTasks(). Without this, a cron trigger would fire, the
      // handler would run, and no task would execute.
      tasks: true,
    },

    // Cron expression → task names. Declared once as SCHEDULED_TASKS at the top
    // of this file (so /api/status can report the same map) — the rules for
    // keeping it in step with wrangler.toml are written there.
    scheduledTasks: SCHEDULED_TASKS,

    // Nitro tree-shakes every module not listed here as side-effect-free. The
    // passkey stack (@simplewebauthn/server → @peculiar/x509 → tsyringe) needs
    // the bare `import 'reflect-metadata'` to run; dropped, the Worker throws
    // "tsyringe requires a reflect polyfill" at startup and serves nothing.
    // Nitro's own defaults are merged in, not replaced.
    moduleSideEffects: ['reflect-metadata'],
  },

  compatibilityDate: '2025-09-01',
})

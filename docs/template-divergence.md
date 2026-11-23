# Template divergence

Dear Mantel is a fork of [nuxt-cf-template](https://github.com/Holojerm/nuxt-cf-template). Every template-owned file under `app/`, `server/`, `shared/` and `scripts/` (fleet's core set, less `server/db/migrations/`, `layers/` and the template's `app-owned.json`) is either byte-identical to the template or listed in `fleet.json` › `template.customized`, with its reason here. Fleet reports anything else as `core_undeclared`, and a missing file nobody declared as `core_missing_undeclared`. An entry ending in `/` declares a whole directory, including template files removed on purpose.

Keep the two in step: a path added to `template.customized` gets a row here in the same commit.

Most rows trace to the teardown: billing, referrals, the MCP worker, the blog and the template's sign-in providers are gone. Sign-in comes from the vendored `credentials` layer (password and passkey) instead.

| Path | Why it differs |
| --- | --- |
| `app/components/Auth/UserMenu.vue` | No billing: Dashboard is shown to everyone signed in, and there is no Pricing link. |
| `app/pages/account.vue` | Dear Mantel's account page: a sign-in section linking to the credentials layer's settings, no plan or cancellation panel (no billing), no MCP connect code, and no email preferences (the only optional mail is the welcome email, gone before this page is reachable; Dear Mantel sends no tips or product mail). |
| `app/pages/admin/users/[id].vue` | Support view without billing, comps or referral panels. |
| `app/pages/auth/verify.vue` | Sign-in is the credentials layer's (`layers/credentials/app/pages/auth/`); no magic-link verify page. |
| `app/pages/blog/` | No blog: @nuxt/content and the blog were torn down. |
| `app/pages/dashboard.vue` | No subscription gate: the page needs a session only, and its copy says so. |
| `app/pages/login.vue` | Sign-in is the credentials layer's `/auth/sign-in`. |
| `app/pages/privacy.vue` | Dear Mantel's privacy policy: encrypted letters, the family room, no payment processor. |
| `app/pages/terms.vue` | Dear Mantel's terms: no payments, its own content section. |
| `app/plugins/attribution.client.ts` | No referral codes, so the first-touch exception for them is gone. |
| `app/utils/admin.ts` | No plan badge: no billing. |
| `app/utils/changelog.ts` | Template changelog entries about billing removed. |
| `app/utils/faq.ts` | Billing FAQ: no billing. |
| `scripts/check-forkless.ts` | Template-only gate that proves a teardown works on a temp copy; this fork is that teardown, so its own `bun run ci` is the proof. |
| `scripts/check-mirrors.ts` | No MCP worker, so no mirrored rules; billing access pins absent with the billing layer. The gate stays, empty, for a future second Worker. |
| `scripts/ci.ts` | No `forkless:check` step (see `scripts/check-forkless.ts`). |
| `server/api/account/export.get.ts` | Comment only: no MCP connect-code limiter to name. |
| `server/api/admin/users/[id].get.ts` | No referral columns. |
| `server/api/auth/apple.ts` | Sign-in is the credentials layer's; no Apple sign-in. |
| `server/api/auth/github.get.ts` | Sign-in is the credentials layer's; no GitHub sign-in. |
| `server/api/auth/google.get.ts` | Sign-in is the credentials layer's; no Google sign-in. |
| `server/api/auth/magic-link.post.ts` | Sign-in is the credentials layer's; no magic-link sign-in. |
| `server/api/auth/magic-link/` | Sign-in is the credentials layer's; no magic-link sign-in. |
| `server/api/auth/providers.get.ts` | No provider list: one sign-in method. |
| `server/api/blog/` | No blog. |
| `server/api/mcp/` | No MCP worker, so no connect codes. |
| `server/plugins/blog-routes.ts` | No blog. |
| `server/routes/llms.txt.get.ts` | No blog posts to append. |
| `server/routes/sitemap.xml.get.ts` | No blog posts to list. |
| `server/tasks/lifecycle-email.ts` | Comment only: no billing step (`pass_expiring`). |
| `server/tasks/purge-expired-tokens.ts` | Description only: no MCP connect codes or billing event ids to purge. |
| `server/utils/account.ts` | Deletion and export without MCP connect codes or referral codes. |
| `server/utils/auth-providers.ts` | No provider list: one sign-in method. |
| `server/utils/blog-routes.ts` | No blog. |
| `server/utils/blog.ts` | No blog. |
| `server/utils/email-templates.ts` | No purchase or pass-expiring email: no billing. |
| `server/utils/lifecycle-emails.ts` | No pass-expiring email: no billing. |
| `server/utils/lifecycle-steps.ts` | Comment only: no billing step. |
| `server/utils/magic-link.ts` | No referral code carried on a link. |
| `server/utils/public-routes.ts` | Comment only: no blog routes to register. |
| `server/utils/purge.ts` | One single-use credential table to sweep (magic links); no MCP connect codes. |
| `shared/utils/analytics-events.ts` | No subscription or referral events. |
| `shared/utils/attribution.ts` | No referral code in the attribution cookie. |
| `shared/utils/blog.ts` | No blog. |
| `shared/utils/fleet-manifest.ts` | Comment only: no MCP worker. |
| `shared/utils/notifications.ts` | No `referral` notification type. |
| `shared/utils/onboarding-steps.ts` | No "Pick a plan" step: no billing. |
| `shared/utils/referral-code.ts` | No referrals. |

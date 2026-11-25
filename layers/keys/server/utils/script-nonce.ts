// A script nonce for every rendered page (pentest DP-15). The account's
// private key sits in IndexedDB on the device, so script injected into a page
// could read it. With 'unsafe-inline' in script-src, injected markup such as
// `<img onerror>` runs; with a nonce in its place, only the scripts the
// framework rendered run.
//
// The template's policy (shared/security-headers.ts) stays as routeRules sets
// it, for responses that are not rendered pages. A page's own header replaces
// it with the same policy, a nonce for 'unsafe-inline' in script-src.
//
// Only the chunks Nuxt builds from head tags get the nonce: `head` (the
// colour-mode guard, the import map, the entry module) and `bodyAppend` (the
// runtime config and payload). Their text comes from unhead, which escapes
// what it is given. The app's own markup (`body`, and `bodyPrepend` with its
// teleports) is never touched, so a `<script>` that got into it stays refused.

import { toBase64Url } from '../../shared/utils/key-format'

export interface PageChunks {
  head: string[]
  bodyAppend: string[]
}

export const newNonce = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

/** `policy` with the nonce in place of script-src's 'unsafe-inline'. */
export function noncedPolicy(policy: string, nonce: string): string {
  return policy
    .split('; ')
    .map((directive) => {
      if (!directive.startsWith('script-src ')) return directive
      const sources = directive.split(' ').filter((source) => source !== "'unsafe-inline'")
      return [...sources, `'nonce-${nonce}'`].join(' ')
    })
    .join('; ')
}

const SCRIPT_OPEN = /<script(?=[\s>])(?![^>]*\snonce=)/g

/** Adds the nonce to every script tag in the head and the closing tags. */
export function nonceFrameworkScripts(chunks: PageChunks, nonce: string): void {
  const stamp = (chunk: string) => chunk.replace(SCRIPT_OPEN, `<script nonce="${nonce}"`)
  chunks.head = chunks.head.map(stamp)
  chunks.bodyAppend = chunks.bodyAppend.map(stamp)
}

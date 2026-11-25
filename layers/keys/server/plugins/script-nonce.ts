// Every rendered page gets its own script nonce and a policy naming it, in
// place of 'unsafe-inline' (server/utils/script-nonce.ts says why).

import { contentSecurityPolicy } from '~~/shared/security-headers'

import { newNonce, nonceFrameworkScripts, noncedPolicy } from '../utils/script-nonce'

export default defineNitroPlugin((nitroApp) => {
  const policy = contentSecurityPolicy(import.meta.dev)
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce = newNonce()
    nonceFrameworkScripts(html, nonce)
    setResponseHeader(event, 'Content-Security-Policy', noncedPolicy(policy, nonce))
  })
})

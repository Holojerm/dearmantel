// Helpers the letters specs share: signing someone up to the end of sign-up,
// and making two people who have accepted each other.

import type { Browser, Page } from '@playwright/test'

import { uniqueEmail } from '../../../../test/e2e/fixtures'
import { open, reload } from '../../../keys/test/e2e/navigation'

export { hydrated, open, reload } from '../../../keys/test/e2e/navigation'

const PASSWORD = 'invite-password-0001'

/** The dev-only link the page shows when no mail provider is configured, as a local path. */
export async function mailedLink(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name }).getAttribute('href')
  const url = new URL(href!)
  return `${url.pathname}${url.hash}`
}

/** From the sign-up page to the end of sign-up: recovery code, then a name and a city. */
export async function finishSignUp(page: Page, email: string, name: string): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await open(page, await mailedLink(page, 'Open the confirmation link'))
  // A browser that can make a passkey is offered Face ID first.
  await page.getByRole('button', { name: 'Use a password instead' }).click()
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('**/welcome/recovery-code', { timeout: 30_000 })
  await page.getByLabel('I have kept my recovery code somewhere safe').check()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL((url) => url.pathname === '/welcome', { timeout: 15_000 })
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Your city').fill('Chicago')
  await page
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Continue' }).click()
}

export interface Pair {
  ann: Page
  bob: Page
  close: () => Promise<void>
}

// Each worker process, and each run, gets its own block of addresses (from the
// range set aside for benchmarks): two specs that both began at the same
// address would share its sign-up budget, and so would a second run started
// within the budget's window.
const block = Math.floor(Math.random() * 256)
let network = 0
let pairs = 0

/**
 * A device on its own network. Outside Cloudflare every caller shares one
 * rate-limit bucket, and a spec's sign-ups would spend the budget the other
 * sign-in specs run on; a forwarded address gives each device its own.
 */
export async function device(browser: Browser, baseURL: string, address?: string): Promise<Page> {
  network += 1
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': address ?? `198.18.${block}.${network}` },
  })
  return context.newPage()
}

/** Ann Tester and Bob Tester, signed up in Chicago and writing to each other. */
export async function makePair(browser: Browser, baseURL: string): Promise<Pair> {
  const ann = await device(browser, baseURL)
  const bob = await device(browser, baseURL)
  // The city list is not a migration; the dev seed offers three cities.
  await ann.request.post('/api/dev/seed')

  await open(ann, '/auth/sign-up')
  // Two pairs made by one worker share its run token, so each gets a number.
  pairs += 1
  await finishSignUp(ann, uniqueEmail(`inviter${pairs}`), 'Ann Tester')
  await ann.waitForURL('**/people', { timeout: 15_000 })
  const bobEmail = uniqueEmail(`invitee${pairs}`)
  await ann.getByLabel('Their email').fill(bobEmail)
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await ann.getByTestId('invite-link').innerText()).trim())

  await open(bob, link.pathname)
  await bob.getByRole('link', { name: 'Create an account to accept' }).click()
  await bob.waitForURL('**/auth/sign-up')
  await finishSignUp(bob, bobEmail, 'Bob Tester')
  // He said yes before he had an account, so it is accepted for him, and he
  // lands on a sheet of paper addressed to Ann.
  await bob.waitForURL('**/write?to=*', { timeout: 15_000 })
  await open(bob, '/people')
  await reload(ann)

  return {
    ann,
    bob,
    close: async () => {
      await ann.context().close()
      await bob.context().close()
    },
  }
}

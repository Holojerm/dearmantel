// An account made with Face ID and no password, in Chromium with a virtual
// authenticator standing in for the phone: its keys are wrapped under the
// passkey, the mantel offers a password once, and the password then opens the
// letters on a device that never had the passkey.

import type { CDPSession, Page } from '@playwright/test'

import { expect, test, uniqueEmail } from '../../../../test/e2e/fixtures'

import { open } from './navigation'

const PASSWORD = 'added-later-password-0001'

async function mailedLink(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name }).getAttribute('href')
  const url = new URL(href!)
  return `${url.pathname}${url.hash}`
}

async function wrapKinds(page: Page): Promise<string> {
  const response = await page.context().request.get('/api/keys')
  const body = (await response.json()) as { keys: { wraps: { kind: string }[] } | null }
  return (body.keys?.wraps ?? [])
    .map((wrap) => wrap.kind)
    .sort()
    .join(' ')
}

async function addVirtualAuthenticator(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  })
  return cdp
}

test('Face ID sign-up: keys under the passkey, then a password offered once', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000)
  const email = uniqueEmail('face-id')
  await addVirtualAuthenticator(page)
  // The city list is not a migration; the dev seed offers three cities. Without
  // it, a fresh database has no Chicago until some other spec seeds one, and the
  // city search below has already come back empty by then.
  await page.request.post('/api/dev/seed')

  await open(page, '/auth/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await open(page, await mailedLink(page, 'Open the confirmation link'))
  await page.getByRole('button', { name: /^Continue with / }).click()
  await page.waitForURL('**/welcome/recovery-code', { timeout: 30_000 })
  expect(await wrapKinds(page)).toBe('passkey recovery')

  await page.getByLabel('I have kept my recovery code somewhere safe').check()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL((url) => url.pathname === '/welcome', { timeout: 15_000 })
  await page.getByLabel('Your name').fill('Ruth')
  await page.getByLabel('Your city').fill('Chicago')
  await page
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/welcome'), { timeout: 15_000 })

  // The mantel asks once for a password, for a computer without the passkey.
  await open(page, '/mantel')
  const offer = page.getByRole('dialog', { name: 'Add a password too?' })
  await expect(offer).toBeVisible({ timeout: 15_000 })
  await offer.getByLabel('New password').fill(PASSWORD)
  await offer.getByRole('button', { name: 'Add a password' }).click()
  await expect(offer).toBeHidden({ timeout: 15_000 })
  await expect.poll(() => wrapKinds(page), { timeout: 15_000 }).toBe('passkey password recovery')

  await open(page, '/mantel')
  await expect(page.getByRole('heading', { name: 'Your mantel' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A computer that never had the passkey opens the letters with the password.
  const computer = await (await browser.newContext({ baseURL })).newPage()
  await open(computer, '/auth/sign-in')
  await computer.getByLabel('Email').fill(email)
  await computer.getByLabel('Password').fill(PASSWORD)
  await computer.getByRole('button', { name: 'Sign in', exact: true }).click()
  await computer.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
  await open(computer, '/mantel')
  await expect(computer).toHaveURL(/\/mantel$/)
  await expect(computer.getByRole('heading', { name: 'Your mantel' })).toBeVisible()
})

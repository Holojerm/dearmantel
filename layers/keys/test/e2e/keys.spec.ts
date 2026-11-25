// The keys, end to end in Chromium: sign-up makes them and shows the recovery
// code once; a second device opens them with the password; after a reset by
// email only the recovery code does, and it restores the password's access.

import type { Browser, Page } from '@playwright/test'

import { expect, test, uniqueEmail } from '../../../../test/e2e/fixtures'

import { hydrated, open, reload } from './navigation'

const FIRST = 'first-password-0001'
const SECOND = 'second-password-0002'

/** The dev-only link the page shows when no mail provider is configured, as a local path. */
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

/** Another device: its own cookies and its own key store. */
async function device(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL })
  return context.newPage()
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await open(page, '/auth/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
}

const newCodeButton = (page: Page) => page.getByRole('button', { name: 'Make a new recovery code' })

test('keys: sign-up, a second device, and recovery after a reset by email', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const email = uniqueEmail('keys')

  // ── Sign-up makes the keys and leads to the recovery code ──────────────────
  await open(page, '/auth/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await open(page, await mailedLink(page, 'Open the confirmation link'))
  await page.getByRole('button', { name: 'Use a password instead' }).click()
  await page.getByLabel('Password').fill(FIRST)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('**/welcome/recovery-code', { timeout: 30_000 })
  const code = (await page.getByTestId('recovery-code').innerText()).trim()
  expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
  expect(await wrapKinds(page)).toBe('password recovery')

  // It is shown until confirmed, a reload included, and the app waits behind it.
  await reload(page)
  await expect(page.getByTestId('recovery-code')).toHaveText(code)
  await page.goto('/dashboard')
  await page.waitForURL('**/welcome/recovery-code')
  // Account pages do not wait: a person can always manage or delete the account.
  await open(page, '/account')
  await expect(page.getByRole('heading', { name: 'Sign-in' })).toBeVisible()

  await open(page, '/welcome/recovery-code')
  await page.getByLabel('I have kept my recovery code somewhere safe').check()
  await page.getByRole('button', { name: 'Continue' }).click()
  // No city chosen yet, so the landing page leads to that next.
  await page.waitForURL((url) => url.pathname === '/welcome', { timeout: 15_000 })
  await reload(page)
  await expect(page.getByTestId('recovery-code')).toHaveCount(0)

  // ── A second device opens the key with the password ────────────────────────
  const second = await device(browser, baseURL!)
  await signIn(second, email, FIRST)
  await open(second, '/settings/recovery-code')
  await expect(newCodeButton(second)).toBeVisible()

  // ── After a reset by email, a new device is locked ─────────────────────────
  const third = await device(browser, baseURL!)
  await open(third, '/auth/reset')
  await third.getByLabel('Email').fill(email)
  await third.getByRole('button', { name: 'Email me a reset link' }).click()
  await open(third, await mailedLink(third, 'Open the reset link'))
  await third.getByLabel('New password').fill(SECOND)
  await third.getByRole('button', { name: 'Set new password' }).click()
  await third.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })
  expect(await wrapKinds(third)).toBe('recovery')

  await third.goto('/settings/recovery-code')
  await third.waitForURL((url) => url.pathname === '/unlock', { timeout: 15_000 })
  await hydrated(third)
  await third.getByLabel('Password').fill(SECOND)
  await third.getByRole('button', { name: 'Open with my password' }).click()
  await expect(third.getByText('Use your recovery code')).toBeVisible({ timeout: 30_000 })

  await third.getByLabel('Recovery code').fill('0000-0000-0000-0000-0000-0000-0000-0000')
  await third.getByRole('button', { name: 'Open with my recovery code' }).click()
  await expect(third.getByText('does not open your letters')).toBeVisible()

  // ── The recovery code opens it, and the new password gets its wrap back ────
  await third.getByLabel('Recovery code').fill(code.toLowerCase())
  await third.getByRole('button', { name: 'Open with my recovery code' }).click()
  await third.waitForURL((url) => url.pathname === '/settings/recovery-code', { timeout: 15_000 })
  await expect(newCodeButton(third)).toBeVisible()
  expect(await wrapKinds(third)).toBe('password recovery')
  await reload(third)
  await expect(newCodeButton(third)).toBeVisible()

  const fourth = await device(browser, baseURL!)
  await signIn(fourth, email, SECOND)
  await open(fourth, '/settings/recovery-code')
  await expect(newCodeButton(fourth)).toBeVisible()

  // ── A new code replaces the old one ────────────────────────────────────────
  await newCodeButton(fourth).click()
  const replaced = (await fourth.getByTestId('recovery-code').innerText()).trim()
  expect(replaced).not.toBe(code)
  expect(await wrapKinds(fourth)).toBe('password recovery')

  // ── Sign-out forgets the key on that device ────────────────────────────────
  await open(fourth, '/account')
  await fourth.locator('button[aria-haspopup="menu"]:visible').first().click()
  await fourth.getByRole('menuitem', { name: 'Sign out' }).click()
  await fourth.waitForURL((url) => url.pathname !== '/account', { timeout: 15_000 })
  const kept = await fourth.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const opening = indexedDB.open('dearmantel-keys')
        opening.onerror = () => resolve(false)
        opening.onsuccess = () => {
          const database = opening.result
          if (!database.objectStoreNames.contains('keys')) return resolve(false)
          const reading = database.transaction('keys').objectStore('keys').get('account')
          reading.onsuccess = () => resolve(Boolean(reading.result))
        }
      }),
  )
  expect(kept).toBe(false)
})

// An invitation, end to end in Chromium: one person invites another by
// email, the other opens the link with no account, signs up, and accepting
// makes them correspondents.

import { expect, test, uniqueEmail } from '../../../../test/e2e/fixtures'

import { device, finishSignUp, open, reload } from './helpers'

test('an invitation: sent, opened signed out, accepted after sign-up', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  // Two people on two networks. Outside Cloudflare every caller shares one
  // rate-limit bucket, and two sign-ups here would spend the budget the other
  // sign-in specs run on; a forwarded address gives each device its own.
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '203.0.113.21' })
  // The city list is not a migration; the dev seed offers three cities.
  await page.request.post('/api/dev/seed')
  const ann = uniqueEmail('inviter')
  const bob = uniqueEmail('invitee')

  // ── Ann signs up, chooses her name and invites Bob ─────────────────────────
  await open(page, '/auth/sign-up')
  await expect(page.getByTestId('sign-up-steps')).toHaveText('Step 1 of 4')
  await finishSignUp(page, ann, 'Ann Tester')
  await page.waitForURL('**/people', { timeout: 15_000 })
  await expect(page.getByText('Nobody yet.')).toBeVisible()
  // Her name was asked with her city, so the invitation form is already here.
  await expect(page.getByText('You write as Ann Tester.')).toBeVisible()
  await page.getByLabel('Their email').fill(bob)
  await page.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await page.getByTestId('invite-link').innerText()).trim())
  await expect(page.getByRole('heading', { name: 'Invitations waiting' })).toBeVisible()
  await expect(page.getByText(bob, { exact: true })).toBeVisible()

  // ── Bob opens the link with no account ─────────────────────────────────────
  const context = await browser.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.22' },
  })
  const other = await context.newPage()
  await open(other, link.pathname)
  await expect(
    other.getByRole('heading', { name: 'Ann Tester would like to write to you' }),
  ).toBeVisible()
  await other.getByRole('link', { name: 'Create an account to accept' }).click()
  await other.waitForURL('**/auth/sign-up')
  // Every step says what it is for.
  await expect(other.getByTestId('sign-up-steps')).toHaveText(
    'Step 1 of 4, to accept the invitation from Ann Tester',
  )
  await finishSignUp(other, bob, 'Bob Tester')

  // He pressed the button before he had an account, so the invitation is
  // accepted for him: sign-up ends on a sheet of paper addressed to Ann.
  await other.waitForURL('**/write?to=*', { timeout: 15_000 })
  await expect(other.getByRole('heading', { name: 'A letter to Ann Tester' })).toBeVisible()
  await expect(other.getByTestId('welcome-note')).toContainText(
    'You and Ann Tester can write to each other now.',
  )
  await expect(other.getByTestId('arrival-line')).toContainText('Sealed today, it arrives')
  await expect(other.getByTestId('sign-up-steps')).toHaveCount(0)
  await open(other, '/people')
  await expect(other.getByText('Ann Tester')).toBeVisible()

  // ── Both now see each other; the invitation is spent ───────────────────────
  await reload(page)
  await expect(page.getByText('Bob Tester')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Invitations waiting' })).toHaveCount(0)

  await open(other, link.pathname)
  await expect(other.getByText('It has already been accepted.')).toBeVisible()
  await context.close()
})

test('an invitation finds the person it was sent to, without the link', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const ann = await device(browser, baseURL!)
  const cy = await device(browser, baseURL!)
  await ann.request.post('/api/dev/seed')
  const cyEmail = uniqueEmail('elsewhere')

  await open(ann, '/auth/sign-up')
  await finishSignUp(ann, uniqueEmail('asker'), 'Ann Tester')
  await ann.waitForURL('**/people', { timeout: 15_000 })
  await ann.getByLabel('Their email').fill(cyEmail)
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  await expect(ann.getByTestId('invite-link')).toBeVisible()

  // ── Ann's empty mantel says what she is waiting for ────────────────────────
  await open(ann, '/mantel')
  await expect(ann.getByTestId('mantel-beginning')).toContainText(
    'You can write as soon as they accept.',
  )

  // ── Cy signs up on a device that never opened the link ─────────────────────
  await open(cy, '/auth/sign-up')
  await expect(cy.getByTestId('sign-up-steps')).toHaveText('Step 1 of 4')
  await finishSignUp(cy, cyEmail, 'Cy Tester')
  await cy.waitForURL('**/people', { timeout: 15_000 })
  await expect(cy.getByRole('heading', { name: 'An invitation for you' })).toBeVisible()
  await expect(cy.getByText('Ann Tester would like to write to you')).toBeVisible()
  await cy.getByRole('button', { name: 'Accept' }).click()
  await cy.waitForURL('**/write?to=*', { timeout: 15_000 })
  await expect(cy.getByRole('heading', { name: 'A letter to Ann Tester' })).toBeVisible()

  // ── It is spent, and her mantel now offers the letter ──────────────────────
  await open(cy, '/people')
  await expect(cy.getByRole('heading', { name: 'An invitation for you' })).toHaveCount(0)
  await open(ann, '/mantel')
  await expect(ann.getByRole('link', { name: 'Write to Cy Tester' })).toBeVisible()

  await ann.context().close()
  await cy.context().close()
})

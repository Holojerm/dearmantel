// A new recovery code for a kept mantel, in Chromium: one keeper replaces it,
// the code printed before stops opening anything, the new one opens the
// mantel, and the other keeper is told once.

import type { Page } from '@playwright/test'

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair, open, reload } from './helpers'

const CODE = /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/

const emailOf = async (page: Page) =>
  ((await (await page.request.get('/api/_auth/session')).json()) as { user: { email: string } })
    .user.email

test('a new recovery code: the old one stops working, the new one opens the mantel', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const oldCode = (await ann.getByTestId('recovery-code').innerText()).trim()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelPath = new URL(ann.url()).pathname

  // ── Bob is seated, so there is another keeper to tell ──────────────────────
  await ann.getByLabel('Their email').fill(await emailOf(bob))
  await ann.getByRole('button', { name: 'Ask them' }).click()
  await open(bob, '/mantels')
  await bob.getByRole('button', { name: 'Accept' }).click()
  const spoken = (await bob.getByTestId('my-fingerprint').innerText()).trim()
  await reload(ann)
  await expect(ann.getByTestId('their-fingerprint')).toHaveText(spoken)
  await ann.getByRole('button', { name: 'They match. Give them the key' }).click()
  await expect(ann.getByTestId('their-fingerprint')).toHaveCount(0)

  // ── Ann replaces the code. Only a wrapped key and a hash leave ─────────────
  await expect(ann.getByRole('heading', { name: 'The recovery code' })).toBeVisible()
  await ann.getByRole('button', { name: 'Make a new recovery code' }).click()
  await expect(ann.getByText('The code printed before stops working at once')).toBeVisible()
  // Changing her mind leaves the code as it was.
  await ann.getByRole('button', { name: 'Keep the old code' }).click()
  await ann.getByRole('button', { name: 'Make a new recovery code' }).click()
  const stored = ann.waitForRequest((request) =>
    request.url().endsWith('/api/mantels/recovery-code'),
  )
  await ann.getByRole('button', { name: 'Replace the recovery code' }).click()
  const sent = (await stored).postDataJSON() as Record<string, unknown>
  expect(Object.keys(sent).toSorted()).toEqual(
    ['keyVersion', 'mantelId', 'publicKey', 'recoveryProofHash', 'recoveryWrap'].toSorted(),
  )
  expect(sent.recoveryWrap).toMatch(/^v1\./)

  await expect(ann.getByRole('heading', { name: "The mantel's new recovery code" })).toBeVisible()
  const newCode = (await ann.getByTestId('recovery-code').innerText()).trim()
  expect(newCode).toMatch(CODE)
  expect(newCode).not.toBe(oldCode)
  expect(JSON.stringify(sent)).not.toContain(newCode.replaceAll('-', ''))
  // Shown again until she says she has it, since the old one is already dead.
  await reload(ann)
  await expect(ann.getByTestId('recovery-code')).toHaveText(newCode)
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await expect(ann.getByTestId('recovery-code')).toHaveCount(0)
  await reload(ann)
  await expect(ann.getByTestId('recovery-code')).toHaveCount(0)
  await expect(ann.getByRole('heading', { name: 'The recovery code' })).toBeVisible()
  await expect(ann.getByText("This mantel's recovery code was replaced")).toHaveCount(0)

  // ── Bob is told once ───────────────────────────────────────────────────────
  await open(bob, mantelPath)
  await expect(bob.getByText("This mantel's recovery code was replaced")).toBeVisible()
  await reload(bob)
  await expect(bob.getByText("This mantel's recovery code was replaced")).toHaveCount(0)

  // ── The code printed before opens nothing; the new one opens the mantel ────
  await open(bob, '/mantels/recover')
  await bob.getByLabel('Recovery code').fill(oldCode)
  await bob.getByRole('button', { name: 'Use the code' }).click()
  await expect(bob.getByText('That code does not open a mantel.')).toBeVisible()
  await bob.getByLabel('Recovery code').fill(newCode)
  await bob.getByRole('button', { name: 'Use the code' }).click()
  await expect(bob.getByText("This device can open Leo's mantel again")).toBeVisible()

  await close()
})

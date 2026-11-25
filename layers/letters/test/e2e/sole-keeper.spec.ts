// A mantel's only keeper deletes their account, in Chromium: refused until
// they show the mantel's recovery code, which is checked on their device;
// then the account goes, the mantel stays, and the code still opens it.

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair, open } from './helpers'

test("a mantel's only keeper deletes their account after showing its code", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const code = (await ann.getByTestId('recovery-code').innerText()).trim()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const email = (
    (await (await ann.request.get('/api/_auth/session')).json()) as { user: { email: string } }
  ).user.email

  // ── The first try is refused, and the dialog says what follows ────────────
  await open(ann, '/account')
  await ann.getByRole('button', { name: 'Delete account' }).click()
  const dialog = ann.getByRole('dialog')
  await dialog.getByLabel('Type your email to confirm').fill(email)
  const remove = dialog.getByRole('button', { name: 'Delete my account' })
  await remove.click()
  // The button that was pressed is disabled now, so focus moves to what appeared.
  await expect(dialog.getByText("You are the only keeper of Leo's mantel.")).toBeFocused()
  await expect(dialog.getByText('Every letter stays, sealed ones too.')).toBeVisible()
  await expect(remove).toBeDisabled()

  // ── Each code is checked on this device before the button is enabled ──────
  const field = dialog.getByLabel("Leo's recovery code")
  const check = dialog.getByRole('button', { name: 'Check the code' })
  await field.fill('not a code')
  await check.click()
  await expect(dialog.getByText('That does not look like a recovery code.')).toBeVisible()
  await field.fill('0000-0000-0000-0000-0000-0000-0000-0000')
  await check.click()
  await expect(dialog.getByText('That code does not open this mantel.')).toBeVisible()
  const found = ann.waitForRequest((request) => request.url().endsWith('/api/mantels/recover/find'))
  await field.fill(code)
  await check.click()
  expect((await found).postData() ?? '').not.toContain(code.replaceAll('-', ''))
  await expect(dialog.getByText("This code opens Leo's mantel.")).toBeVisible()
  await expect(remove).toBeDisabled()
  await dialog
    .getByLabel("I understand that only this code will open Leo's mantel once my account is gone")
    .check()
  await expect(remove).toBeEnabled()
  await remove.click()
  await ann.waitForURL((url) => url.pathname === '/')
  expect((await (await ann.request.get('/api/_auth/session')).json()) as object).not.toHaveProperty(
    'user',
  )

  // ── The mantel stays, and its code still opens it for someone else ────────
  await open(bob, '/mantels/recover')
  await bob.getByLabel('Recovery code').fill(code)
  await bob.getByRole('button', { name: 'Use the code' }).click()
  await expect(bob.getByText(/You will keep Leo's mantel from /)).toBeVisible()
  // With no keeper left, nobody can cancel it, and the page says so.
  await open(bob, '/mantels')
  await expect(
    bob.getByText(/^Nobody keeps Leo's mantel now, so nobody can cancel this\./),
  ).toBeVisible()

  await close()
})

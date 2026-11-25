// A mantel's key that may have got out, in Chromium: one keeper proposes
// changing it, the other agrees and changes it in his browser, and the copy
// of the old key under the printed code opens nothing afterwards.

import { expect, test } from '../../../../test/e2e/fixtures'

import { makePair, open } from './helpers'

test("the keepers agree to change a mantel's key, and the old one opens nothing", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)
  const view = async (page: typeof ann, id: string) =>
    (await (await page.request.post('/api/mantels/view', { data: { id } })).json()) as {
      publicKey: string
      keyVersion: number
    }

  // ── Ann opens Leo's mantel and keeps its first recovery code ───────────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const firstCode = (await ann.getByTestId('recovery-code').innerText()).trim()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelPath = new URL(ann.url()).pathname
  const mantelId = mantelPath.split('/').pop()!

  // ── Bob is seated after the fingerprints match ─────────────────────────────
  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { email: string }
  }
  await ann.getByLabel('Their email').fill(session.user.email)
  await ann.getByRole('button', { name: 'Ask them' }).click()
  await open(bob, '/mantels')
  await bob.getByRole('button', { name: 'Accept' }).click()
  const spoken = (await bob.getByTestId('my-fingerprint').innerText()).trim()
  await ann.reload({ waitUntil: 'networkidle' })
  await expect(ann.getByTestId('their-fingerprint')).toHaveText(spoken)
  await ann.getByRole('button', { name: 'They match. Give them the key' }).click()
  await expect(ann.getByTestId('their-fingerprint')).toHaveCount(0)
  const before = await view(ann, mantelId)

  // ── Ann proposes changing the key. Alone, she cannot ───────────────────────
  await expect(ann.getByRole('heading', { name: 'If the key got out' })).toBeVisible()
  await ann.getByRole('button', { name: "Propose changing the mantel's key" }).click()
  await ann.getByRole('button', { name: 'Propose changing it' }).click()
  await expect(ann.getByText("Change Leo's key", { exact: true })).toBeVisible()
  await expect(ann.getByText('1 of 2 keepers agree.')).toBeVisible()
  await expect(ann.getByRole('heading', { name: "Change this mantel's key" })).toHaveCount(0)
  await expect(ann.getByRole('heading', { name: 'If the key got out' })).toHaveCount(0)

  // ── Bob agrees, and the change is his to make, here ────────────────────────
  await open(bob, mantelPath)
  await bob.getByRole('button', { name: "Agree: Change Leo's key" }).click()
  const heading = bob.getByRole('heading', { name: "Change this mantel's key" })
  await expect(heading).toBeFocused()
  await expect(bob.getByText("Leo's keepers agreed to change its key")).toBeVisible()
  await bob.getByRole('button', { name: 'Change the key' }).click()
  await expect(bob.getByRole('heading', { name: "The mantel's new recovery code" })).toBeVisible()
  const secondCode = (await bob.getByTestId('recovery-code').innerText()).trim()
  expect(secondCode).not.toBe(firstCode)
  await bob.getByLabel('I have kept my recovery code somewhere safe').check()
  await bob.getByRole('button', { name: 'Continue' }).click()
  await bob.reload({ waitUntil: 'networkidle' })
  await expect(heading).toHaveCount(0)
  await expect(bob.getByText("Change Leo's key", { exact: true })).toHaveCount(0)

  const after = await view(bob, mantelId)
  expect(after.keyVersion).toBe(before.keyVersion + 1)
  expect(after.publicKey).not.toBe(before.publicKey)

  // ── Ann's next visit takes the new key and needs nothing ───────────────────
  const settled = ann.waitForResponse((response) =>
    response.url().endsWith('/api/mantels/rekey/settle'),
  )
  await open(ann, mantelPath)
  expect((await settled).status()).toBe(200)
  await expect(ann.getByText("This mantel's key was changed")).toBeVisible()
  await expect(ann.getByText('This device cannot open this mantel')).toHaveCount(0)

  // ── The old key, under the code printed before, opens nothing ──────────────
  await open(ann, '/mantels/recover')
  await ann.getByLabel('Recovery code').fill(firstCode)
  await ann.getByRole('button', { name: 'Use the code' }).click()
  await expect(ann.getByText('That code does not open a mantel.')).toBeVisible()

  await close()
})

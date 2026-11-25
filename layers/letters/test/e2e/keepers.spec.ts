// A mantel for a child, in Chromium: its keys are made in the browser, its
// recovery code is shown once, a second keeper is seated only after the two
// people have the same fingerprint on their screens, and closing it takes both.

import { readFile } from 'node:fs/promises'

import { expect, test, uniqueEmail } from '../../../../test/e2e/fixtures'

import { device, finishSignUp, makePair, open, reload } from './helpers'

// A 1 × 1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('a kept mantel: opened, its code shown once, a second keeper seated', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  // ── Ann opens Leo's mantel; only a public key and wrapped copies leave ─────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  const created = ann.waitForRequest(
    (request) => request.url().endsWith('/api/mantels') && request.method() === 'POST',
  )
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const sent = (await created).postDataJSON() as Record<string, string>
  expect(Object.keys(sent).toSorted()).toEqual(
    [
      'handoverOn',
      'id',
      'keeperWrap',
      'kind',
      'name',
      'publicKey',
      'recoveryProofHash',
      'recoveryWrap',
    ].toSorted(),
  )
  expect(sent.keeperWrap).toMatch(/^v1\./)
  // A child's mantel is handed over on a day set now, 18 years on unless changed.
  expect(sent.handoverOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(sent.recoveryWrap).toMatch(/^v1\./)

  await expect(ann.getByRole('heading', { name: "The mantel's recovery code" })).toBeVisible()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  await expect(ann.getByRole('heading', { name: 'Leo', exact: true })).toBeVisible()
  await expect(ann.getByText('This mantel has one keeper')).toBeVisible()

  // ── She asks Bob. He accepts and reads his key's fingerprint to her ────────
  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { email: string }
  }
  await ann.getByLabel('Their email').fill(session.user.email)
  await ann.getByRole('button', { name: 'Ask them' }).click()
  await expect(ann.getByText(/They have not accepted yet/)).toBeVisible()

  await open(bob, '/mantels')
  await expect(bob.getByText('You keep no mantels.')).toBeVisible()
  await bob.getByRole('button', { name: 'Accept' }).click()
  await expect(bob.getByTestId('my-fingerprint')).toHaveText(/^([0-9a-f]{4} ){5}[0-9a-f]{4}$/)
  const spoken = (await bob.getByTestId('my-fingerprint').innerText()).trim()

  // ── Ann sees the same groups, and her browser wraps the key to him ─────────
  await reload(ann)
  await expect(ann.getByTestId('their-fingerprint')).toHaveText(spoken)
  const granted = ann.waitForRequest(
    (request) =>
      request.url().endsWith('/api/mantels/proposals/seat') &&
      (request.postData() ?? '').includes('wrapped'),
  )
  await ann.getByRole('button', { name: 'They match. Give them the key' }).click()
  expect(((await granted).postDataJSON() as { wrapped: string }).wrapped).toMatch(/^v1\./)
  await expect(ann.getByText('Bob Tester')).toBeVisible()
  await expect(ann.getByText('This mantel has one keeper')).toHaveCount(0)

  // ── Bob keeps it now, and his device can open his copy of the key ──────────
  await open(bob, '/mantels')
  await bob.getByRole('link', { name: 'Open Leo' }).click()
  await expect(bob.getByText('Ann Tester')).toBeVisible()
  await expect(bob.getByText('Bob Tester (you)')).toBeVisible()
  await expect(bob.getByText('This device cannot open this mantel')).toHaveCount(0)

  // ── Neither of two keepers can remove the other alone ──────────────────────
  await bob
    .getByRole('button', { name: 'Propose that Ann Tester stops keeping this mantel' })
    .click()
  await expect(bob.getByText('1 of 2 keepers agree.')).toBeVisible()
  await expect(bob.getByText('Ann Tester', { exact: true })).toBeVisible()

  // ── Closing it takes both of them too ──────────────────────────────────────
  await bob.getByRole('button', { name: "Propose closing Leo's mantel" }).click()
  await bob.getByRole('button', { name: 'Propose closing it' }).click()
  await expect(bob.getByText("Close Leo's mantel", { exact: true })).toBeVisible()
  await expect(bob.getByTestId('mantel-closed')).toHaveCount(0)

  await reload(ann)
  await ann.getByRole('button', { name: "Agree: Close Leo's mantel" }).click()
  await expect(ann.getByTestId('mantel-closed')).toBeVisible()
  // Nobody joins or leaves it now, and the removal Bob proposed is gone.
  await expect(ann.getByLabel('Their email')).toHaveCount(0)
  await expect(ann.getByText('Ann Tester stops keeping this mantel')).toHaveCount(0)
  await expect(ann.getByText('Bob Tester')).toBeVisible()
  await expect(ann.getByRole('button', { name: 'Write to Leo' })).toHaveCount(0)

  await close()
})

test('a keeper asks someone to write to the mantel', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()

  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { email: string }
  }
  await ann.getByLabel('Invite a writer by email').fill(session.user.email)
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  const link = new URL((await ann.getByTestId('writer-invite-link').innerText()).trim())
  await expect(ann.getByText(`${session.user.email} · invited`)).toBeVisible()

  // ── Bob is asked to write to Leo, not to Ann, and cannot see the mantel ────
  await open(bob, link.pathname)
  await expect(
    bob.getByRole('heading', { name: 'Ann Tester asks you to write to Leo' }),
  ).toBeVisible()
  await bob.getByRole('button', { name: 'Accept the invitation' }).click()
  // Accepting leads to a sheet of paper addressed to Leo.
  await bob.waitForURL('**/write?to=*')
  await expect(bob.getByRole('heading', { name: 'A letter to Leo' })).toBeVisible()
  await expect(bob.getByTestId('welcome-note')).toContainText('You can write to Leo now.')
  await open(bob, '/people')
  await expect(bob.getByRole('link', { name: 'Write to Leo' })).toBeVisible()
  await open(bob, '/mantels')
  await expect(bob.getByText('You keep no mantels.')).toBeVisible()

  await reload(ann)
  await expect(ann.getByText('Bob Tester', { exact: true })).toBeVisible()

  await close()
})

test('a wedding guest writes from the card, with no account', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, close } = await makePair(browser, baseURL!)

  // ── The couple's mantel, its post and its write link ───────────────────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Anniversary letters for a couple').check()
  await ann.getByLabel('Whose mantel is it?').fill('Maya and Theo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await expect(ann.getByText(/Its post arrives in Chicago/)).toBeVisible()
  // Its days and hour change from tomorrow, like a person's own.
  await ann.getByRole('button', { name: 'Change its post' }).click()
  await ann.getByLabel('Saturday').uncheck()
  await ann.getByRole('button', { name: 'Save days and hour' }).click()
  await expect(ann.getByText(/A change to its days and hour starts on /)).toBeVisible()
  await reload(ann)
  await ann.getByRole('button', { name: 'Make the write link' }).click()
  const address = new URL((await ann.getByTestId('guest-link').innerText()).trim())
  expect(address.pathname).toMatch(/^\/w\/[A-Za-z0-9_-]{22}$/)
  expect(address.hash).toMatch(/^#[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/)
  // Every device that opens the mantel works out the same address.
  await reload(ann)
  await expect(ann.getByTestId('guest-link')).toHaveText(address.href)

  // ── A guest, signed out, on their own phone ────────────────────────────────
  // Guests are limited per address per hour; a fresh one keeps reruns honest.
  const guest = await device(browser, baseURL!, `198.51.100.${1 + Math.floor(Math.random() * 250)}`)
  await open(guest, `${address.pathname}#not-the-printed-fingerprint`)
  await expect(guest.getByText('This link does not match its card')).toBeVisible()
  await expect(guest.getByLabel('Your letter')).toHaveCount(0)

  // The path and the right fingerprint, without the secret: told nothing.
  const [fingerprint] = address.hash.slice(1).split('.')
  const refused = guest.waitForResponse((response) =>
    response.url().endsWith('/api/letters/guest/view'),
  )
  await open(guest, `${address.pathname}#${fingerprint}.${'A'.repeat(22)}`)
  expect(await (await refused).json()).toEqual({ status: 'unknown' })
  await expect(guest.getByText(/This link does not take letters/)).toBeVisible()
  await expect(guest.getByLabel('Your letter')).toHaveCount(0)

  await open(guest, `${address.pathname}${address.hash}`)
  await expect(guest.getByRole('heading', { name: 'A letter to Maya and Theo' })).toBeVisible()
  await guest.getByLabel('Your letter').fill('May your house be loud and your table long.')
  await guest.getByLabel('Signed').fill('Aunt Rosa')
  await guest
    .getByLabel('Add a photo')
    .setInputFiles({ name: 'table.png', mimeType: 'image/png', buffer: PNG })
  await guest.getByLabel('Describe the photo').fill('The long table')
  const posted = guest.waitForRequest((request) =>
    request.url().endsWith('/api/letters/guest/post-photo'),
  )
  await guest.getByRole('button', { name: 'Seal and send' }).click()
  const sent = (await posted).postDataBuffer()?.toString('latin1') ?? ''
  expect(sent).toContain('"ciphertext":"v1.')
  expect(sent).not.toContain('Rosa')
  expect(sent).not.toContain('table long')
  expect(sent).not.toContain('The long table')
  expect(sent).not.toContain('JFIF')
  await expect(guest.getByRole('heading', { name: 'Sealed' })).toBeVisible()
  await expect(guest.getByText(/^It opens on /)).toBeVisible()

  // ── The only copy the guest will ever have is made on their device ─────────
  const saving = guest.waitForEvent('download')
  await guest.getByRole('button', { name: 'Save a copy' }).click()
  const download = await saving
  expect(download.suggestedFilename()).toBe('Letter to Maya and Theo.zip')
  const copy = (await readFile(await download.path())).toString('latin1')
  expect(copy).toContain('letter.txt')
  expect(copy).toContain('photo.jpg')
  expect(copy).toContain('May your house be loud and your table long.')
  expect(copy).toContain('Aunt Rosa')
  expect(
    (await (await guest.request.get('/api/_auth/session')).json()) as object,
  ).not.toHaveProperty('user')

  // ── The couple sees that a letter came through the link, and no more ───────
  await reload(ann)
  await expect(ann.getByText('1 of 300 letters received through this link.')).toBeVisible()
  await expect(ann.getByText('Nothing has arrived yet.')).toBeVisible()

  await guest.context().close()
  await close()
})

test("a mantel's recovery code: a keeper is restored at once, anyone else waits", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const code = (await ann.getByTestId('recovery-code').innerText()).trim()
  expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelPath = new URL(ann.url()).pathname

  // ── A wrong code opens nothing; the code itself is never sent ──────────────
  await open(bob, '/mantels/recover')
  await bob.getByLabel('Recovery code').fill('0000-0000-0000-0000-0000-0000-0000-0000')
  await bob.getByRole('button', { name: 'Use the code' }).click()
  await expect(bob.getByText('That code does not open a mantel.')).toBeVisible()

  const found = bob.waitForRequest((request) => request.url().endsWith('/api/mantels/recover/find'))
  await bob.getByLabel('Recovery code').fill(code.toLowerCase())
  await bob.getByRole('button', { name: 'Use the code' }).click()
  expect((await found).postData() ?? '').not.toContain(code.replaceAll('-', '').toLowerCase())
  await expect(bob.getByText(/You will keep Leo's mantel from /)).toBeVisible()
  await open(bob, '/mantels')
  await expect(bob.getByText('You keep no mantels.')).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Become a keeper' })).toHaveCount(0)

  // ── The keeper is shown it and cancels ─────────────────────────────────────
  await open(ann, mantelPath)
  await expect(ann.getByText("This mantel's recovery code was used")).toBeVisible()
  await ann.getByRole('button', { name: 'Cancel it' }).click()
  await expect(ann.getByText("This mantel's recovery code was used")).toHaveCount(0)
  await open(bob, '/mantels')
  await expect(bob.getByText('Recovery codes you used')).toHaveCount(0)

  // ── The keeper herself uses it: her access comes back at once ──────────────
  await open(ann, '/mantels/recover')
  await ann.getByLabel('Recovery code').fill(code)
  await ann.getByRole('button', { name: 'Use the code' }).click()
  await expect(ann.getByText("This device can open Leo's mantel again")).toBeVisible()
  await ann.getByRole('link', { name: 'Open the mantel' }).click()
  await expect(ann.getByText('This device cannot open this mantel')).toHaveCount(0)

  await close()
})

test("a keeper leaves: the mantel's key is changed and the others keep reading", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)
  const cal = await device(browser, baseURL!)
  await open(cal, '/auth/sign-up')
  await finishSignUp(cal, uniqueEmail('third'), 'Cal Tester')
  await cal.waitForURL('**/people', { timeout: 15_000 })
  const emailOf = async (page: typeof ann) =>
    ((await (await page.request.get('/api/_auth/session')).json()) as { user: { email: string } })
      .user.email

  // ── Ann opens Leo's mantel and keeps its first recovery code ───────────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  const firstCode = (await ann.getByTestId('recovery-code').innerText()).trim()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelPath = new URL(ann.url()).pathname

  // ── Bob and then Cal are seated, each after the fingerprints match ─────────
  async function seat(who: typeof ann, agreeing: (typeof ann)[]) {
    await ann.getByLabel('Their email').fill(await emailOf(who))
    await ann.getByRole('button', { name: 'Ask them' }).click()
    await expect(ann.getByText(/They have not accepted yet/)).toBeVisible()
    for (const keeper of agreeing) {
      await open(keeper, mantelPath)
      await keeper.getByRole('button', { name: 'Agree' }).click()
    }
    await open(who, '/mantels')
    await who.getByRole('button', { name: 'Accept' }).click()
    const spoken = (await who.getByTestId('my-fingerprint').innerText()).trim()
    await reload(ann)
    await expect(ann.getByTestId('their-fingerprint')).toHaveText(spoken)
    await ann.getByRole('button', { name: 'They match. Give them the key' }).click()
    await expect(ann.getByTestId('their-fingerprint')).toHaveCount(0)
  }
  await seat(bob, [])
  await seat(cal, [bob])
  await open(cal, mantelPath)
  await expect(cal.getByText('This device cannot open this mantel')).toHaveCount(0)
  await expect(ann.getByRole('heading', { name: "Change this mantel's key" })).toHaveCount(0)

  // ── Two of three agree that Cal stops keeping it ───────────────────────────
  await ann
    .getByRole('button', { name: 'Propose that Cal Tester stops keeping this mantel' })
    .click()
  await expect(ann.getByText('1 of 3 keepers agree.')).toBeVisible()
  await open(bob, mantelPath)
  await bob.getByRole('button', { name: 'Agree' }).click()
  await expect(bob.getByText('Cal Tester')).toHaveCount(0)

  // ── Ann changes the key. Only wrapped keys leave her browser ───────────────
  await reload(ann)
  await expect(ann.getByRole('heading', { name: "Change this mantel's key" })).toBeVisible()
  const stored = ann.waitForRequest((request) => request.url().endsWith('/api/letters/kept/rekey'))
  await ann.getByRole('button', { name: 'Change the key' }).click()
  const sent = (await stored).postDataJSON() as Record<string, unknown>
  expect(Object.keys(sent).toSorted()).toEqual(
    [
      'handovers',
      'keeperWrap',
      'keyVersion',
      'letterKeys',
      'mantelId',
      'publicKey',
      'recoveryProofHash',
      'recoveryWrap',
    ].toSorted(),
  )
  expect(sent.keeperWrap).toMatch(/^v1\./)
  expect(Object.values(sent.handovers as Record<string, string>)).toHaveLength(1)

  await expect(ann.getByRole('heading', { name: "The mantel's new recovery code" })).toBeVisible()
  const secondCode = (await ann.getByTestId('recovery-code').innerText()).trim()
  expect(secondCode).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
  expect(secondCode).not.toBe(firstCode)
  // The old code is dead now, so the new one is not lost by leaving the page
  // before it has been kept: it is shown again until she says she has it.
  await reload(ann)
  await expect(ann.getByTestId('recovery-code')).toHaveText(secondCode)
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await expect(ann.getByTestId('recovery-code')).toHaveCount(0)
  await reload(ann)
  await expect(ann.getByTestId('recovery-code')).toHaveCount(0)
  await expect(ann.getByRole('heading', { name: "Change this mantel's key" })).toHaveCount(0)
  await expect(ann.getByText('This device cannot open this mantel')).toHaveCount(0)

  // ── Bob was not there. His next visit takes the new key and needs nothing ──
  const settled = bob.waitForResponse((response) =>
    response.url().endsWith('/api/mantels/rekey/settle'),
  )
  await open(bob, mantelPath)
  expect((await settled).status()).toBe(200)
  await expect(bob.getByText("This mantel's key was changed")).toBeVisible()
  await expect(bob.getByText('This device cannot open this mantel')).toHaveCount(0)
  await expect(bob.getByRole('heading', { name: "Change this mantel's key" })).toHaveCount(0)
  await reload(bob)
  await expect(bob.getByText("This mantel's key was changed")).toHaveCount(0)
  await expect(bob.getByText('This device cannot open this mantel')).toHaveCount(0)

  // ── The code printed before opens nothing; Cal keeps no mantel ─────────────
  await open(cal, '/mantels/recover')
  await cal.getByLabel('Recovery code').fill(firstCode)
  await cal.getByRole('button', { name: 'Use the code' }).click()
  await expect(cal.getByText('That code does not open a mantel.')).toBeVisible()
  await open(cal, '/mantels')
  await expect(cal.getByText('You keep no mantels.')).toBeVisible()

  await cal.context().close()
  await close()
})

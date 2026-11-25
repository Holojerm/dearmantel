// Every test here moves the dev clock, which every browser shares, so they
// live in one file and run one after the other.
//
// A letter, end to end in Chromium: encrypted in the browser, sealed with
// its arrival day shown, recalled before pickup, delivered days later on the
// recipient's mail day, read there, and answered.

import { readFile } from 'node:fs/promises'

import { expect, test, uniqueEmail } from '../../../../test/e2e/fixtures'

import { device, finishSignUp, makePair, open } from './helpers'

// The suite runs tests in parallel even inside a file. These two must not.
test.describe.configure({ mode: 'serial' })

const TEXT = 'Dear Bob, the plums are ripe. Come in August.'
// A 1 × 1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('a letter: written, sealed, recalled, delivered, read and answered', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  // ── Ann writes; the draft is saved encrypted ───────────────────────────────
  await ann.getByRole('link', { name: 'Write to Bob Tester' }).click()
  await ann.waitForURL('**/write?to=*')
  await expect(ann.getByRole('heading', { name: 'A letter to Bob Tester' })).toBeVisible()
  const saved = ann.waitForRequest(
    (request) => request.url().endsWith('/api/letters/drafts') && request.method() === 'PUT',
  )
  await ann.getByLabel('Your letter').fill(TEXT)
  const sent = (await saved).postData() ?? ''
  expect(sent).toContain('"ciphertext":"v1.')
  expect(sent).not.toContain('plums')
  await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
  await ann.waitForURL('**/write?letter=*')

  // ── Formatting and a hand of her own are part of the encrypted letter ──────
  await ann.getByLabel('Your letter').press('ControlOrMeta+a')
  await ann.getByRole('button', { name: 'Bold' }).click()
  await ann.getByRole('button', { name: 'Centre' }).click()
  await ann.getByLabel('Hand').click()
  await ann.getByRole('option', { name: 'Quick hand' }).click()

  // ── A photo is redrawn and encrypted here; the server gets a sealed file ───
  const uploaded = ann.waitForRequest(
    (request) => request.url().includes('/api/letters/drafts/photo?') && request.method() === 'PUT',
  )
  await ann
    .getByLabel('Add a photo')
    .setInputFiles({ name: 'plums.png', mimeType: 'image/png', buffer: PNG })
  const file = (await uploaded).postDataBuffer()
  expect(file?.[0]).toBe(1)
  expect(file?.includes('PNG')).toBe(false)
  expect(file?.includes('JFIF')).toBe(false)
  await ann.getByLabel('Describe the photo').fill('The plum tree')

  // ── Sealing says when it is collected and when it arrives ──────────────────
  await ann.getByRole('button', { name: 'Seal the letter' }).click()
  // Pickup is 5 pm in Chicago, where she lives, whatever zone the browser is in.
  await expect(ann.getByText(/It will be collected on \w+ at 5:00.+ and arrives/)).toBeVisible()
  await ann.getByRole('button', { name: 'Seal and post' }).click()
  await ann.waitForURL('**/desk')
  await expect(ann.getByText(/^Sealed\. Collected .+, arrives .+\.$/)).toBeVisible()

  // It reads back on this device, and cannot be changed.
  await ann.getByRole('link', { name: 'Read your letter to Bob Tester' }).click()
  await expect(ann.getByText('This letter is sealed')).toBeVisible()
  await expect(ann.getByText(TEXT)).toBeVisible()
  await expect(ann.getByRole('img', { name: 'The plum tree' })).toBeVisible()
  await expect(ann.getByLabel('Your letter')).toHaveCount(0)

  // ── Before pickup it can be recalled, changed and sealed again ─────────────
  await ann.goto('/desk', { waitUntil: 'networkidle' })
  await ann.getByRole('button', { name: 'Recall the letter to Bob Tester' }).click()
  await expect(ann.getByText(/^Draft, edited /)).toBeVisible()
  await ann.getByRole('link', { name: 'Continue' }).click()
  await expect(ann.getByLabel('Your letter')).toHaveText(TEXT)
  await expect(ann.getByLabel('Describe the photo')).toHaveValue('The plum tree')
  await ann.getByLabel('Your letter').fill(`${TEXT} Bring the dog.`)
  await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
  await ann.getByRole('button', { name: 'Seal the letter' }).click()
  await ann.getByRole('button', { name: 'Seal and post' }).click()
  await ann.waitForURL('**/desk')
  await expect(ann.getByText(/^Sealed\. Collected /)).toBeVisible()
  await expect(ann.getByText('No drafts.')).toBeVisible()

  // ── Nothing shows on Bob's mantel until his mail day comes round ───────────
  await bob.goto('/mantel', { waitUntil: 'networkidle' })
  await expect(bob.getByText('Nothing has arrived yet.')).toBeVisible()
  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { id: string }
  }
  try {
    // The dev clock: each jump is Bob's next mail day, and runs the release.
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', {
        data: { action: 'mail-day', userId: session.user.id },
      })
      await bob.goto('/mantel', { waitUntil: 'networkidle' })
      if ((await bob.getByText('From Ann Tester').count()) > 0) break
    }
    await expect(bob.getByText('From Ann Tester')).toBeVisible()
    await expect(bob.getByText('Unopened')).toBeVisible()

    // ── He opens it on his own device and answers on a sheet below it ────────
    await bob.getByRole('link', { name: /From Ann Tester/ }).click()
    await expect(bob.getByText(`${TEXT} Bring the dog.`)).toBeVisible()
    await expect(bob.locator('article.letter-face-hand strong')).toHaveText(
      `${TEXT} Bring the dog.`,
    )
    await expect(bob.locator('article.letter-face-hand p.letter-align-center')).toHaveCount(1)
    await expect(bob.getByRole('img', { name: 'The plum tree' })).toBeVisible()
    await bob.getByRole('link', { name: 'Reply' }).click()
    await expect(bob.getByText('You are replying to')).toBeVisible()
    await expect(bob.getByText(`${TEXT} Bring the dog.`)).toBeVisible()
    await bob.getByLabel('Your letter').fill('Dear Ann, we will come. The dog too.')
    await expect(bob.getByText('Saved, encrypted on this device.')).toBeVisible()
    await bob.getByRole('button', { name: 'Seal the letter' }).click()
    await bob.getByRole('button', { name: 'Seal and post' }).click()
    await bob.waitForURL('**/desk')
    await bob.goto('/mantel', { waitUntil: 'networkidle' })
    await expect(bob.getByText('Unopened')).toHaveCount(0)

    // ── He keeps a copy: made on his device, readable without Dear Mantel ────
    await bob.getByRole('link', { name: 'Keep a copy of your letters' }).click()
    await bob.waitForURL('**/archive')
    await expect(bob.getByText('2 letters')).toBeVisible()
    const saving = bob.waitForEvent('download')
    await bob.getByRole('button', { name: 'Save a copy of your letters with Ann Tester' }).click()
    const download = await saving
    expect(download.suggestedFilename()).toMatch(/^Dear Mantel Ann Tester \d{4}-\d{2}-\d{2}\.zip$/)
    await expect(bob.getByText('Saved 2 letters.')).toBeVisible()
    const archive = (await readFile(await download.path())).toString('latin1')
    expect(archive.startsWith('PK')).toBe(true)
    for (const part of ['README.txt', 'letters.html', 'from Ann Tester.txt', 'to Ann Tester.txt']) {
      expect(archive).toContain(part)
    }
    expect(archive).toContain(`${TEXT} Bring the dog.`)
    expect(archive).toMatch(/photos\/001 \d{4}-\d{2}-\d{2} from Ann Tester\.jpg/)

    // ── Ann is told nothing: her desk has only what the postmark allows ──────
    await ann.goto('/desk', { waitUntil: 'networkidle' })
    await expect(ann.getByText(/^(In transit, arrives|Postmarked) /)).toBeVisible()
    await expect(ann.getByRole('button', { name: /Recall/ })).toHaveCount(0)
    await ann.goto('/mantel', { waitUntil: 'networkidle' })
    await expect(ann.getByText('Nothing has arrived yet.')).toBeVisible()
  } finally {
    await ann.request.post('/api/dev/clock', { data: { action: 'reset' } })
  }

  await close()
})

// Letters to a kept mantel: it gets its own post, its keepers set the day a
// letter may be sealed until, a keeper writes to it, one letter is sealed
// until that day, and after delivery the server gives up the open letter and
// nothing of the sealed one. Then the mantel writes back, as Leo.
const NOW_LETTER = 'Dear Leo, you laughed for the first time today.'
const LATER_LETTER = 'Dear Leo, read this when you are eighteen.'
const REPLY = 'Dear Mum, I drew you a dog.'

test('a kept mantel takes letters, and a sealed one stays sealed', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, close } = await makePair(browser, baseURL!)

  // ── Ann opens Leo's mantel and gives it its post ───────────────────────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelId = new URL(ann.url()).pathname.split('/').pop()!
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await expect(ann.getByText(/Its post arrives in Chicago/)).toBeVisible()

  // ── The keepers let letters open on arrival or on his 18th birthday ───────
  await ann.getByLabel('A day to seal letters until').fill('2044-06-14')
  await ann.getByLabel('What the day is (optional)').fill('18th birthday')
  await ann.getByRole('button', { name: 'Add the day' }).click()
  await ann.getByRole('button', { name: 'Save how letters open' }).click()
  await expect(ann.getByText(/Last changed by Ann Tester/)).toBeVisible()

  // ── She writes one letter to be read now, and one sealed until 2044 ────────
  async function write(text: string, sealUntil?: string) {
    await open(ann, `/mantels/${mantelId}`)
    await ann.getByRole('button', { name: 'Write to Leo' }).click()
    await ann.waitForURL('**/write?to=*')
    await expect(ann.getByRole('heading', { name: 'A letter to Leo' })).toBeVisible()
    await ann.getByLabel('Your letter').fill(text)
    await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
    await ann.getByRole('button', { name: 'Seal the letter' }).click()
    if (sealUntil) await ann.getByLabel(new RegExp(`^${sealUntil}`)).check()
    await ann.getByRole('button', { name: 'Seal and post' }).click()
    await ann.waitForURL('**/desk')
  }
  await write(NOW_LETTER)
  await write(LATER_LETTER, '18th birthday')
  await expect(ann.getByText(/Sealed until .*2044\.$/)).toBeVisible()

  try {
    // ── Nothing shows until the mantel's own mail day ────────────────────────
    await open(ann, `/mantels/${mantelId}`)
    await expect(ann.getByText('Nothing has arrived yet.')).toBeVisible()
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', { data: { action: 'mail-day', userId: mantelId } })
      await open(ann, `/mantels/${mantelId}`)
      if ((await ann.getByText(/^From Ann Tester$/).count()) > 1) break
    }
    await expect(ann.getByText(/^From Ann Tester$/)).toHaveCount(2)
    await expect(ann.getByText(/^Sealed\. Opens .*2044\.$/)).toBeVisible()
    // One letter can be read; the sealed one offers nothing to open.
    await expect(ann.getByRole('link', { name: 'Read the letter from Ann Tester' })).toHaveCount(1)

    // ── The open letter is decrypted here with the mantel's key ──────────────
    await ann.getByRole('link', { name: 'Read the letter from Ann Tester' }).click()
    await expect(ann.getByText(NOW_LETTER)).toBeVisible()

    // ── She keeps a copy: the opened letter is in it, the sealed one is not ──
    await open(ann, `/mantels/${mantelId}`)
    const saving = ann.waitForEvent('download')
    await ann.getByRole('button', { name: "Keep a copy of Leo's letters" }).click()
    const download = await saving
    expect(download.suggestedFilename()).toMatch(/^Dear Mantel Leo \d{4}-\d{2}-\d{2}\.zip$/)
    const copy = (await readFile(await download.path())).toString('latin1')
    expect(copy).toContain('Letters to Leo')
    expect(copy).toContain(NOW_LETTER)
    expect(copy).not.toContain(LATER_LETTER)
    await expect(ann.getByText('Saved 1 letter. Left out: 1 letter still sealed.')).toBeVisible()

    // ── The server gives up nothing of the sealed one, even to its keeper ────
    const listed = (await (
      await ann.request.post('/api/letters/kept/list', { data: { mantelId } })
    ).json()) as { letters: { letterId: string; sealed: boolean }[] }
    const sealed = listed.letters.find((letter) => letter.sealed)!
    const answer = await ann.request.post('/api/letters/kept/open', {
      data: { mantelId, letterId: sealed.letterId },
    })
    expect(Object.keys((await answer.json()) as object).toSorted()).toEqual(
      ['letterId', 'opensOn', 'postmark', 'sealed'].toSorted(),
    )
    await open(ann, `/kept/${mantelId}/${sealed.letterId}`)
    await expect(ann.getByText(/Sealed until .*2044/)).toBeVisible()
    await expect(ann.getByText(LATER_LETTER)).toHaveCount(0)
    await expect(ann.getByRole('link', { name: 'Write back as Leo' })).toHaveCount(0)

    // ── Leo writes back, with Ann holding the pen ─────────────────────────────
    const opened = listed.letters.find((letter) => !letter.sealed)!
    await open(ann, `/kept/${mantelId}/${opened.letterId}`)
    await ann.getByRole('link', { name: 'Write back as Leo' }).click()
    await expect(
      ann.getByRole('heading', { name: 'A letter from Leo to Ann Tester' }),
    ).toBeVisible()
    await expect(ann.getByText(NOW_LETTER)).toBeVisible()
    await ann.getByLabel('Your letter').fill(REPLY)
    await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
    await ann.getByRole('button', { name: 'Seal the letter' }).click()
    await ann.getByRole('button', { name: 'Seal and post' }).click()
    await ann.waitForURL(`**/mantels/${mantelId}`)
    await expect(ann.getByText('To Ann Tester', { exact: true })).toBeVisible()

    // ── It arrives on Ann's own mantel, from Leo ─────────────────────────────
    const me = (await (await ann.request.get('/api/_auth/session')).json()) as {
      user: { id: string }
    }
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', { data: { action: 'mail-day', userId: me.user.id } })
      await open(ann, '/mantel')
      if (await ann.getByText('From Leo').count()) break
    }
    await ann.getByRole('link', { name: /From Leo/ }).click()
    await expect(ann.getByText(REPLY)).toBeVisible()

    // ── A copy of Leo's letters now holds the one he wrote ───────────────────
    await open(ann, `/mantels/${mantelId}`)
    const savingAgain = ann.waitForEvent('download')
    await ann.getByRole('button', { name: "Keep a copy of Leo's letters" }).click()
    const both = (await readFile(await (await savingAgain).path())).toString('latin1')
    expect(both).toContain('Letters to and from Leo')
    expect(both).toContain(NOW_LETTER)
    expect(both).toContain(REPLY)
    expect(both).not.toContain(LATER_LETTER)
    await expect(ann.getByText('Saved 2 letters. Left out: 1 letter still sealed.')).toBeVisible()
  } finally {
    await ann.request.post('/api/dev/clock', { data: { action: 'reset' } })
  }

  await close()
})

const NEWS = 'Leo walked today. Four steps, from the sofa to the dog.'

test('news of a child: asked for, sent, read, and not answered', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  // ── Ann opens Leo's mantel and asks Bob to read his news ───────────────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelId = new URL(ann.url()).pathname.split('/').pop()!
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await expect(ann.getByText(/Its post arrives in Chicago/)).toBeVisible()
  await expect(
    ann.getByText('Nobody yet, apart from the people who keep this mantel.'),
  ).toBeVisible()
  const session = (await (await bob.request.get('/api/_auth/session')).json()) as {
    user: { id: string; email: string }
  }
  await ann.getByLabel('Ask someone to read it').fill(session.user.email)
  await ann.getByRole('button', { name: 'Send the invitation' }).click()
  const link = new URL((await ann.getByTestId('news-invite-link').innerText()).trim())

  // ── Bob accepts: it is news to read, not someone to write to ───────────────
  await open(bob, link.pathname)
  await expect(
    bob.getByRole('heading', { name: 'Ann Tester would like to send you news of Leo' }),
  ).toBeVisible()
  await bob.getByRole('button', { name: 'Accept the invitation' }).click()
  // Nothing to do but wait: he lands on his mantel, told what will come.
  await bob.waitForURL('**/mantel')
  await expect(bob.getByTestId('welcome-note')).toContainText('News of Leo will come here')
  await open(bob, '/people')
  await expect(bob.getByText('News of Leo')).toBeVisible()
  await expect(bob.getByRole('link', { name: 'Write to Leo' })).toHaveCount(0)

  // ── Ann writes the news; Leo's own mantel gets a copy unless she says not ──
  await open(ann, `/mantels/${mantelId}`)
  await expect(ann.getByRole('button', { name: 'Stop sending news to Bob Tester' })).toBeVisible()
  await ann.getByRole('link', { name: 'Write news of Leo' }).click()
  await ann.waitForURL('**/write?to=*')
  await expect(ann.getByRole('heading', { name: 'News of Leo' })).toBeVisible()
  const newsId = new URL(ann.url()).searchParams.get('to')!
  await ann.getByLabel('Your letter').fill(NEWS)
  await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
  await ann.getByRole('button', { name: 'Seal the letter' }).click()
  await expect(ann.getByLabel("Put a copy on Leo's mantel too")).toBeChecked()
  await expect(ann.getByText('Bob Tester · arrives')).toBeVisible()
  await expect(ann.getByText('Leo · arrives')).toBeVisible()
  await ann.getByRole('button', { name: 'Seal and post' }).click()
  await ann.waitForURL('**/desk')
  await expect(ann.getByText('To everyone who gets news of Leo')).toBeVisible()

  try {
    // ── It comes to Bob like any letter, days later ──────────────────────────
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', {
        data: { action: 'mail-day', userId: session.user.id },
      })
      await bob.goto('/mantel', { waitUntil: 'networkidle' })
      if ((await bob.getByText('News of Leo').count()) > 0) break
    }
    await bob.getByRole('link', { name: /News of Leo/ }).click()
    await expect(bob.getByText(NEWS)).toBeVisible()
    // Set in capitals by CSS, so the case is not the text's.
    await expect(bob.getByText(/from ann tester\s+·\s+postmarked/i)).toBeVisible()
    await expect(bob.getByRole('link', { name: 'Reply' })).toHaveCount(0)

    // ── He cannot write in it, or learn who else reads it ────────────────────
    expect(
      (
        await bob.request.post('/api/letters/seal-plan', { data: { correspondenceId: newsId } })
      ).status(),
    ).toBe(409)
    expect(
      (await bob.request.post('/api/letters/news/readers', { data: { mantelId } })).status(),
    ).toBe(404)

    // ── Leo's copy is on his mantel, where Ann keeps it ───────────────────────
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', { data: { action: 'mail-day', userId: mantelId } })
      await open(ann, `/mantels/${mantelId}`)
      if ((await ann.getByText(/^From Ann Tester$/).count()) > 0) break
    }
    await expect(ann.getByText(/^From Ann Tester$/)).toHaveCount(1)
  } finally {
    await ann.request.post('/api/dev/clock', { data: { action: 'reset' } })
  }

  // ── Bob stops getting it ───────────────────────────────────────────────────
  await open(bob, '/people')
  await bob.getByRole('button', { name: 'Stop getting news of Leo' }).click()
  await expect(bob.getByText('News you get')).toHaveCount(0)
  await open(ann, `/mantels/${mantelId}`)
  await expect(
    ann.getByText('Nobody yet, apart from the people who keep this mantel.'),
  ).toBeVisible()

  await close()
})

// Handing Leo's mantel over: the day is set when it is opened, the address a
// keeper gives is invited once the day has come, Leo accepts and reads the
// key's fingerprint to his keeper, and his browser makes the letters his. His
// keeper then keeps nothing.
const FOR_LEO = 'Dear Leo, this one is yours now.'

test('a child’s mantel is handed over, and its keeper keeps nothing', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000)
  const { ann, close } = await makePair(browser, baseURL!)

  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  await ann.getByLabel('When does it become theirs?').fill(tomorrow)
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelId = new URL(ann.url()).pathname.split('/').pop()!
  await ann.getByLabel("The mantel's city").fill('Chicago')
  await ann
    .getByRole('button', { name: /^Chicago/ })
    .first()
    .click()
  await expect(ann.getByText(/Its post arrives in Chicago/)).toBeVisible()
  await expect(ann.getByText(/Leo's mantel becomes theirs on/)).toBeVisible()

  // ── Ann writes to him ─────────────────────────────────────────────────────
  await ann.getByRole('button', { name: 'Write to Leo' }).click()
  await ann.waitForURL('**/write?to=*')
  await ann.getByLabel('Your letter').fill(FOR_LEO)
  await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
  await ann.getByRole('button', { name: 'Seal the letter' }).click()
  await ann.getByRole('button', { name: 'Seal and post' }).click()
  await ann.waitForURL('**/desk')

  const leo = await device(browser, baseURL!)
  const leoEmail = uniqueEmail('handover')
  try {
    // ── The letter arrives, and the handover day comes ───────────────────────
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', { data: { action: 'mail-day', userId: mantelId } })
      await open(ann, `/mantels/${mantelId}`)
      const arrived = (await ann.getByText(/^From Ann Tester$/).count()) > 0
      if (arrived && (await ann.getByText('The handover day has come.').count())) break
    }
    await expect(ann.getByText(/The handover day has come/)).toBeVisible()

    // ── Ann gives his address; it is invited at once ─────────────────────────
    await ann.getByLabel("Leo's email").fill(leoEmail)
    await ann.getByRole('button', { name: 'Give the address' }).click()
    await expect(ann.getByTestId('handover-address')).toContainText('was invited')

    // ── Leo makes an account with it and accepts ─────────────────────────────
    await open(leo, '/auth/sign-up')
    await finishSignUp(leo, leoEmail, 'Leo Tester')
    await leo.waitForURL('**/people', { timeout: 15_000 })
    await open(leo, '/mantels')
    await expect(leo.getByRole('heading', { name: 'Kept for you' })).toBeVisible()
    await leo.getByRole('button', { name: 'Accept the mantel' }).click()
    const his = (await leo.getByTestId('my-fingerprint').innerText()).trim()

    // ── Ann checks the fingerprint with him and hands over the key ───────────
    await open(ann, `/mantels/${mantelId}`)
    await expect(ann.getByTestId('child-fingerprint')).toHaveText(his)
    await ann.getByRole('button', { name: 'They match. Hand over the key' }).click()
    await expect(ann.getByText(/holds the key/)).toBeVisible()

    // ── Leo's browser makes the letters his ──────────────────────────────────
    await open(leo, '/mantels')
    await leo.getByRole('button', { name: 'Make the letters mine' }).click()
    await expect(leo.getByText('The letters are yours.', { exact: false })).toBeVisible({
      timeout: 30_000,
    })
    await leo.getByRole('link', { name: 'Go to your mantel' }).click()
    await leo.getByRole('link', { name: /From Ann Tester/ }).click()
    await expect(leo.getByText(FOR_LEO)).toBeVisible()

    // ── Ann keeps nothing: no mantel, no key, no letters ─────────────────────
    await open(ann, `/mantels/${mantelId}`)
    await expect(ann.getByText('You do not keep that mantel.')).toBeVisible()
    const listed = await ann.request.post('/api/letters/kept/list', { data: { mantelId } })
    expect(listed.ok()).toBe(false)
  } finally {
    await ann.request.post('/api/dev/clock', { data: { action: 'reset' } })
    await leo.context().close()
  }

  await close()
})

// A letter a child's mantel wrote comes back to it: Bob writes to Leo, Leo
// writes back with Ann holding the pen, and Bob stops writing before the
// answer arrives. It returns to Leo's mantel, where its keeper can read it
// and cannot answer it.
const TO_LEO = 'Dear Leo, the dog sends his regards.'
const FROM_LEO = 'Dear Bob, tell the dog I said hello.'

test('a letter from a kept mantel comes back to it', async ({ browser, baseURL }) => {
  test.setTimeout(240_000)
  const { ann, bob, close } = await makePair(browser, baseURL!)

  // ── Ann opens Leo's mantel, gives it its post and asks Bob to write ────────
  await open(ann, '/mantels/new')
  await ann.getByLabel('Whose mantel is it?').fill('Leo')
  await ann.getByRole('button', { name: 'Open the mantel' }).click()
  await ann.getByLabel('I have kept my recovery code somewhere safe').check()
  await ann.getByRole('button', { name: 'Continue' }).click()
  await ann.waitForURL(/\/mantels\/[0-9a-f-]{36}$/)
  const mantelId = new URL(ann.url()).pathname.split('/').pop()!
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
  await open(bob, link.pathname)
  await bob.getByRole('button', { name: 'Accept the invitation' }).click()
  await bob.waitForURL('**/write?to=*')

  try {
    // ── Bob writes to Leo, and it arrives on the mantel ──────────────────────
    await bob.getByLabel('Your letter').fill(TO_LEO)
    await expect(bob.getByText('Saved, encrypted on this device.')).toBeVisible()
    await bob.getByRole('button', { name: 'Seal the letter' }).click()
    await bob.getByRole('button', { name: 'Seal and post' }).click()
    await bob.waitForURL('**/desk')
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', { data: { action: 'mail-day', userId: mantelId } })
      await open(ann, `/mantels/${mantelId}`)
      if (await ann.getByText('From Bob Tester', { exact: true }).count()) break
    }

    // ── Leo writes back ───────────────────────────────────────────────────────
    await ann.getByRole('link', { name: 'Read the letter from Bob Tester' }).click()
    await expect(ann.getByText(TO_LEO)).toBeVisible()
    await ann.getByRole('link', { name: 'Write back as Leo' }).click()
    await expect(
      ann.getByRole('heading', { name: 'A letter from Leo to Bob Tester' }),
    ).toBeVisible()
    await ann.getByLabel('Your letter').fill(FROM_LEO)
    await expect(ann.getByText('Saved, encrypted on this device.')).toBeVisible()
    await ann.getByRole('button', { name: 'Seal the letter' }).click()
    await ann.getByRole('button', { name: 'Seal and post' }).click()
    await ann.waitForURL(`**/mantels/${mantelId}`)

    // ── Bob stops writing to Leo while the answer is on its way ──────────────
    await open(bob, '/people')
    await bob.getByRole('button', { name: 'Stop writing with Leo' }).click()
    await bob.getByRole('button', { name: 'Stop writing', exact: true }).click()
    await expect(bob.getByRole('button', { name: 'Stop writing with Leo' })).toHaveCount(0)

    // ── It comes back with the mantel's own post ─────────────────────────────
    const returned = "Returned: Leo's letter to Bob Tester"
    for (let day = 0; day < 6; day += 1) {
      await ann.request.post('/api/dev/clock', { data: { action: 'mail-day', userId: mantelId } })
      await open(ann, `/mantels/${mantelId}`)
      if (await ann.getByText(returned).count()) break
    }
    await expect(ann.getByText(returned)).toBeVisible()

    await ann.getByRole('link', { name: 'Read the returned letter to Bob Tester' }).click()
    await expect(ann.getByRole('heading', { name: returned })).toBeVisible()
    await expect(ann.getByText('Returned to sender')).toBeVisible()
    await expect(
      ann.getByText("This letter could not be delivered, so it has come back to Leo's mantel."),
    ).toBeVisible()
    await expect(ann.getByText(FROM_LEO)).toBeVisible()
    await expect(
      ann.getByText("This letter was opened on your device with Leo's key."),
    ).toBeVisible()
    await expect(ann.getByRole('link', { name: 'Write back as Leo' })).toHaveCount(0)
  } finally {
    await ann.request.post('/api/dev/clock', { data: { action: 'reset' } })
  }

  await close()
})

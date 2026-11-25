// In a real browser (pentest DP-15): a page's policy names a nonce instead of
// 'unsafe-inline', the framework's own inline scripts carry it and run, and
// markup injected into the page runs nothing.

import { expect, test } from '@playwright/test'

test('a page allows its own inline scripts by nonce, and nothing injected', async ({ page }) => {
  const response = await page.goto('/')
  const policy = response!.headers()['content-security-policy'] ?? ''
  const scriptSrc = /(?:^|; )script-src ([^;]+)/.exec(policy)?.[1] ?? ''
  expect(scriptSrc).not.toContain("'unsafe-inline'")
  const nonce = /'nonce-([\w-]+)'/.exec(scriptSrc)?.[1]
  expect(nonce).toBeTruthy()

  // Every inline script the server rendered carries this page's nonce.
  const html = await response!.text()
  const inline = html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) ?? []
  expect(inline.length).toBeGreaterThan(0)
  for (const tag of inline) expect(tag).toContain(`nonce="${nonce}"`)

  // The page hydrated, so the colour-mode guard and the runtime config ran.
  await expect(page.locator('html')).toHaveClass(/light|dark/)
  expect(await page.evaluate(() => typeof (window as { __NUXT__?: unknown }).__NUXT__)).toBe(
    'object',
  )

  const ran = await page.evaluate(async () => {
    const win = window as unknown as { injected?: boolean }
    document.body.insertAdjacentHTML(
      'beforeend',
      '<img alt="" src="data:," onerror="window.injected = true">',
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    return win.injected === true
  })
  expect(ran).toBe(false)
})

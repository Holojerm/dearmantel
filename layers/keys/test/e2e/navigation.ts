// Page loads for the specs that type and click right after one. `networkidle`
// alone is not enough: on a starved CI machine the network goes quiet while the
// browser is still evaluating the dev server's modules, so a spec could fill a
// field before Vue hydrates it, and hydration then puts the model's empty value
// back (norandel#109: "Use the code" stayed disabled until the 300 s timeout).

import type { Page } from '@playwright/test'

/** Resolves once the app has hydrated, so typing and clicks reach Vue. */
export async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { useNuxtApp?: () => { isHydrating?: boolean } }).useNuxtApp?.()
        .isHydrating === false,
  )
}

export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle' })
  await hydrated(page)
}

export async function reload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'networkidle' })
  await hydrated(page)
}

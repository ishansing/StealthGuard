import { expect, test, type Page } from '@playwright/test'

const BASE = 'http://localhost:5173'

function jitter(): number {
  return 40 + Math.floor(Math.random() * 90)
}

/** Type with realistic, varied timing (holds + inter-key gaps). */
async function humanLikeType(page: Page, selector: string, text: string): Promise<void> {
  await page.locator(selector).click()
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: jitter() })
    await page.waitForTimeout(30 + Math.random() * 70)
  }
}

/** Wander the mouse along a curved path with pauses between waypoints. */
async function humanLikeMouse(page: Page): Promise<void> {
  const path = [
    [120, 140],
    [220, 90],
    [300, 180],
    [240, 260],
    [340, 220],
  ] as const
  for (const [x, y] of path) {
    await page.mouse.move(x, y, { steps: 4 })
    await page.waitForTimeout(120 + Math.random() * 150)
  }
}

test('human-like interaction resolves to allow', async ({ page }) => {
  await page.goto(BASE)
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await expect(signIn).toBeEnabled({ timeout: 15000 })

  await humanLikeType(page, '#username', 'alice')
  await humanLikeMouse(page)
  await humanLikeType(page, '#password', 'secret123')
  await signIn.click()

  const result = page.getByTestId('submit-decision')
  await expect(result).toBeVisible({ timeout: 20000 })
  await expect(result).toContainText('allow')
})

test('uniform bot-like interaction resolves to block or challenge', async ({ page }) => {
  await page.goto(BASE)
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await expect(signIn).toBeEnabled({ timeout: 15000 })

  await page.locator('#username').focus()
  await page.keyboard.type('bot', { delay: 50 })
  await page.keyboard.press('Tab')
  await page.keyboard.type('botbot', { delay: 50 })
  await page.keyboard.press('Enter')

  const result = page.getByTestId('submit-decision')
  await expect(result).toBeVisible({ timeout: 20000 })
  await expect(result).toContainText(/block|challenge/)
})

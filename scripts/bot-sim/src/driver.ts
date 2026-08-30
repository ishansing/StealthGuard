import { chromium, type Browser, type Page } from 'playwright'

import type { SessionPlan } from './personas'

/**
 * Drives the real demo login form so the StealthGuard SDK captures the events
 * and the gateway scores them — a genuine browser-to-gateway session per plan.
 *
 * Fields are focused programmatically (not clicked) and bots submit with Enter
 * so the SDK's captured mouse stream stays clean — incidental cursor jumps
 * would inject extreme speeds into the mouse features.
 */

export async function openBrowser(): Promise<Browser> {
  return chromium.launch()
}

async function wait(page: Page, ms: number): Promise<void> {
  if (ms > 0) await page.waitForTimeout(ms)
}

async function typeKeys(page: Page, keys: SessionPlan['keystrokes'], prev: number): Promise<void> {
  for (const k of keys) {
    await wait(page, Math.max(1, (k.down_time - prev) * 1000))
    await page.keyboard.down(k.key)
    await wait(page, Math.max(1, (k.up_time - k.down_time) * 1000))
    await page.keyboard.up(k.key)
    prev = k.down_time
  }
}

async function moveMouse(page: Page, moves: SessionPlan['mouse_moves']): Promise<void> {
  if (moves.length === 0) return
  await page.mouse.move(moves[0].x, moves[0].y, { steps: 1 })
  for (let i = 1; i < moves.length; i++) {
    await wait(page, Math.max(1, (moves[i].t - moves[i - 1].t) * 1000))
    await page.mouse.move(moves[i].x, moves[i].y, { steps: 1 })
  }
}

export async function driveSession(browser: Browser, demoUrl: string, plan: SessionPlan): Promise<string> {
  const page = await browser.newPage()
  try {
    await page.goto(demoUrl)
    const signIn = page.getByRole('button', { name: 'Sign in' })
    await signIn.waitFor({ state: 'visible', timeout: 25000 })

    const keys = plan.keystrokes
    const split = Math.max(1, Math.ceil(keys.length / 2))

    await page.locator('#username').focus()
    await typeKeys(page, keys.slice(0, split), keys[0]?.down_time ?? 0)

    await page.locator('#password').focus()
    await typeKeys(page, keys.slice(split), keys[split - 1]?.down_time ?? 0)

    await moveMouse(page, plan.mouse_moves)

    if (plan.label === 'human') {
      const box = await signIn.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
        await wait(page, 150)
      }
      await signIn.click()
    } else {
      await page.keyboard.press('Enter')
    }

    const result = page.getByTestId('submit-decision')
    await result.waitFor({ state: 'visible', timeout: 25000 })
    return (await result.textContent()) ?? ''
  } finally {
    await page.close()
  }
}
import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:5174'
const GATEWAY = 'http://localhost:8080'

test('reviewer feedback click persists via the API', async ({ page, request }) => {
  const init = await request.post(`${GATEWAY}/stealthguard/session/init`, {
    data: { page: '/login' },
  })
  expect(init.ok()).toBeTruthy()
  const { session_id } = (await init.json()) as { session_id: string }

  const telemetry = await request.post(`${GATEWAY}/stealthguard/telemetry`, {
    data: {
      session_id,
      keystrokes: [
        { key: 'a', down_time: 1.0, up_time: 1.1 },
        { key: 'b', down_time: 1.1, up_time: 1.2 },
        { key: 'c', down_time: 1.2, up_time: 1.3 },
      ],
      mouse_moves: [
        { x: 0, y: 0, t: 1.0 },
        { x: 10, y: 10, t: 1.05 },
      ],
    },
  })
  expect(telemetry.ok()).toBeTruthy()

  await page.goto(BASE)
  const row = page.getByTestId(`session-row-${session_id}`)
  await expect(row).toBeVisible({ timeout: 20000 })

  await row.click()
  await expect(page.getByTestId('mouse-path')).toBeVisible({ timeout: 10000 })

  await page.getByTestId('mark-human').click()
  await expect(page.getByTestId('feedback-status')).toContainText(/Saved/, { timeout: 10000 })
})

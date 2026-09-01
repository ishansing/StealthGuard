import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/stealthguard/session/init')) {
      return Promise.resolve({ ok: true, json: async () => ({ session_id: 'sandbox-session' }) })
    }
    if (url.includes('/stealthguard/telemetry') || url.includes('/stealthguard/score')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          decision: 'allow',
          humanness_score: 0.9,
          reason_codes: [{ code: 'natural_keystroke_variance', weight: 0.5 }],
        }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Sandbox', () => {
  it('renders the live-scoring form and rhythm line', async () => {
    stubFetch()
    render(<App />)

    expect(screen.getByLabelText('Telemetry Input Canvas')).toBeTruthy()
    expect(screen.getByTestId('rhythm-line')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Score it/i })).toBeTruthy()
  })

  it('posts a persona telemetry and shows its decision', async () => {
    const fetchMock = stubFetch()
    render(<App />)

    fireEvent.click(screen.getByTestId('persona-naive bot'))
    const result = await screen.findByTestId('list-result-naive bot')
    expect(result.textContent).toContain('Pass')

    const telemetryCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/telemetry'))
    expect(telemetryCall).toBeDefined()
  })

  it('moves the rhythm marker with the live score', async () => {
    stubFetch()
    render(<App />)
    // Default (no decision yet) marker sits at the center (50%).
    expect(
      screen.getByTestId('rhythm-line').querySelector('.rhythm-marker')?.getAttribute('style'),
    ).toContain('50%')
  })
})

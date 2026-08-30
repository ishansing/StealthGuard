import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const SESSION = {
  session_id: '11111111-2222-3333-4444-555555555555',
  page: '/login',
  created_at: '2026-08-26T10:00:00Z',
  user_agent: 'test-agent',
  input_modality: 'mouse',
  decision: 'block',
  humanness_score: 0.1,
  model_version: 'rule-based',
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/admin/sessions/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...SESSION, reason_codes: [], events: [] }),
      })
    }
    if (url.includes('/admin/sessions')) {
      return Promise.resolve({ ok: true, json: async () => ({ content: [SESSION] }) })
    }
    if (url.includes('/admin/stats')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ decisions: {}, labels: {}, score_histogram: {} }),
      })
    }
    if (url.includes('/admin/feedback')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, id: 1 }) })
    }
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('lists sessions, opens a detail, and posts reviewer feedback', async () => {
    const fetchMock = stubFetch()
    render(<App />)

    const row = await screen.findByTestId('session-row-11111111-2222-3333-4444-555555555555')
    expect(row.textContent).toContain('block')

    fireEvent.click(row)
    await screen.findByTestId('mouse-path')
    expect(screen.getByText(/Session 11111111/)).toBeTruthy()

    fireEvent.click(screen.getByTestId('mark-human'))
    await screen.findByTestId('feedback-status')
    expect(screen.getByTestId('feedback-status').textContent).toContain('Saved')

    const feedbackCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/admin/feedback'))
    expect(feedbackCall).toBeDefined()
    expect(JSON.parse(String(feedbackCall?.[1]?.body)).corrected_label).toBe('human')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

import { StealthGuardClient } from './client'
import type { Decision } from './types'

const DECISION: Decision = {
  session_id: 's-1',
  decision: 'allow',
  humanness_score: 0.9,
  model_version: 'rule-based',
  reason_codes: [],
}

function mockFetch(): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => DECISION })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('StealthGuardClient autoInstrument (Phase 9 B2)', () => {
  it('instruments forms present at start() and flushes on submit', async () => {
    const fetchMock = mockFetch()
    document.body.innerHTML = '<form id="login"><input name="u" /></form>'
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
      autoInstrument: true,
    })

    await client.start()
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 2 }))
    const form = document.getElementById('login') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(client.decision).toBeTruthy()
    })
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/telemetry'))
    expect(call).toBeDefined()
  })

  it('picks up forms added to the DOM after start() via MutationObserver', async () => {
    mockFetch()
    document.body.innerHTML = '<div id="app"></div>'
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
      autoInstrument: true,
    })
    await client.start()

    const late = document.createElement('form')
    late.id = 'late-form'
    late.innerHTML = '<input name="u" />'
    document.getElementById('app')!.appendChild(late)

    await vi.waitFor(() => {
      expect(client['instrumentedForms'].has(late)).toBe(true)
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 3, clientY: 4 }))
    late.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => {
      expect(client.decision).toBeTruthy()
    })
  })

  it('autoInstrument: false (default) does not touch forms', async () => {
    mockFetch()
    document.body.innerHTML = '<form id="login"></form>'
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
    })

    await client.start()
    expect(
      client['instrumentedForms'].has(document.getElementById('login') as HTMLFormElement),
    ).toBe(false)
  })
})

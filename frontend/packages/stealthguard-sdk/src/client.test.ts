import { afterEach, describe, expect, it, vi } from 'vitest'

import { StealthGuardClient } from './client'
import type { Decision } from './types'

const DECISION: Decision = {
  session_id: 's-1',
  decision: 'allow',
  humanness_score: 0.9,
  model_version: 'rule-based',
  reason_codes: [{ code: 'natural_keystroke_variance', weight: 0.5 }],
}

function mockFetch(): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => DECISION })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StealthGuardClient', () => {
  it('attaches listeners on init and detaches on destroy', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    mockFetch()
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
    })

    await client.init()
    expect(add).toHaveBeenCalled()

    client.destroy()
    expect(remove).toHaveBeenCalled()
  })

  it('creates a session via /session/init when none is provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 'fresh-session' }) })
      .mockResolvedValue({ ok: true, json: async () => DECISION })
    vi.stubGlobal('fetch', fetchMock)
    const client = new StealthGuardClient({ gatewayUrl: 'http://gw', flushIntervalMs: 0 })

    await client.init()

    expect(fetchMock.mock.calls[0][0]).toContain('/stealthguard/session/init')
    expect(client.sessionId).toBe('fresh-session')
  })

  it('caps buffers at maxEventsPerType', async () => {
    mockFetch()
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
      maxEventsPerType: 3,
    })
    await client.init()

    for (let i = 0; i < 5; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: i, clientY: i }))
    }

    expect(client.computeFeaturesClientSide().mouse_moves?.length).toBe(3)
  })

  it('flushes raw telemetry with the expected shape and clears buffers', async () => {
    const fetchMock = mockFetch()
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
    })
    await client.init()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }))
    document.dispatchEvent(new MouseEvent('click', { clientX: 12, clientY: 22 }))

    const decision = await client.flush()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(fetchMock.mock.calls[0][0]).toContain('/stealthguard/telemetry')
    expect(body.session_id).toBe('s-1')
    expect(body.privacy_mode).toBe('raw')
    expect(body.sdk_version).toBeDefined()
    expect(body.meta.input_modality).toBe('mouse')
    expect(body.meta.viewport_width).toBeGreaterThan(0)
    expect(body.keystrokes).toHaveLength(1)
    expect(body.keystrokes[0].key).toBe('a')
    expect(body.mouse_moves).toHaveLength(1)
    expect(body.clicks).toHaveLength(1)
    expect(decision?.decision).toBe('allow')

    expect(client.computeFeaturesClientSide().keystrokes).toHaveLength(0)
  })

  it('aggregated mode sends only the feature vector, never raw events', async () => {
    const fetchMock = mockFetch()
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
      privacyMode: 'aggregated',
    })
    await client.init()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }))

    await client.flush()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.keystrokes).toBeUndefined()
    expect(body.mouse_moves).toBeUndefined()
    expect(body.touch_moves).toBeUndefined()
    expect(body.clicks).toBeUndefined()
    expect(body.features).toBeDefined()
    expect(typeof body.features.event_count).toBe('number')
    expect(body.features.keystroke_mean_hold_ms).toBeGreaterThanOrEqual(0)
  })

  it('challenge respond posts to the gateway', async () => {
    const fetchMock = mockFetch()
    const client = new StealthGuardClient({
      gatewayUrl: 'http://gw',
      flushIntervalMs: 0,
      sessionId: 's-1',
    })
    await client.init()

    const result = await client.respondChallenge('4')

    expect(fetchMock.mock.calls[0][0]).toContain(`/stealthguard/challenge/s-1/respond`)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      challenge_type: 'math',
      response: '4',
    })
    expect(result?.decision).toBe('allow')
  })
})

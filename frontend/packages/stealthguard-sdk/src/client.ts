import { computeFeatures, type RawTelemetry } from './feature-extraction'
import type {
  Decision,
  DecisionValue,
  PrivacyMode,
  StealthGuardOptions,
  TelemetryMeta,
} from './types'

interface Keystroke {
  key: string | null
  down_time: number
  up_time: number
}

interface Point {
  x: number
  y: number
  t: number
}

type Listener = (decision: Decision) => void

/**
 * StealthGuard telemetry collector (SPEC §6.2). Attaches global keyboard /
 * pointer / touch listeners, buffers bounded event arrays, and flushes them
 * to the gateway on an interval, on demand, and via sendBeacon on unload.
 *
 * Framework-agnostic core; the React hook (`useStealthGuard`) is a thin adapter.
 */
export class StealthGuardClient {
  readonly gatewayUrl: string
  readonly page: string
  readonly privacyMode: PrivacyMode
  readonly flushIntervalMs: number
  readonly maxEventsPerType: number
  readonly autoInstrument: boolean
  readonly selector: string
  readonly sdkVersion = '0.1.0'

  private readonly listeners = new Set<Listener>()
  private keystrokes: Keystroke[] = []
  private mouseMoves: Point[] = []
  private touchMoves: Point[] = []
  private clicks: Point[] = []
  private readonly keysDown = new Map<string, number>()
  private _sessionId: string | null
  private timer: ReturnType<typeof setInterval> | null = null
  private sawMouse = false
  private sawTouch = false
  private latestDecision: Decision | null = null
  private pasteEvents = 0
  private keylessFills = 0
  private focusedKeydowns = 0
  private readonly instrumentedForms = new WeakSet<HTMLFormElement>()
  private observer: MutationObserver | null = null
  private instrumented = false
  private readonly _onKeystroke?: (event: { key: string; holdMs: number }) => void
  private readonly _onMouseMove?: (event: { x: number; y: number; t: number }) => void

  constructor(options: StealthGuardOptions) {
    this.gatewayUrl = options.gatewayUrl.replace(/\/$/, '')
    this.page = options.page ?? '/'
    this.privacyMode = options.privacyMode ?? 'raw'
    this.flushIntervalMs = options.flushIntervalMs ?? 2000
    this.maxEventsPerType = options.maxEventsPerType ?? 500
    this.autoInstrument = options.autoInstrument ?? false
    this.selector = options.selector ?? 'form'
    this._sessionId = options.sessionId ?? null
    this._onKeystroke = options.onKeystroke
    this._onMouseMove = options.onMouseMove
  }

  get sessionId(): string | null {
    return this._sessionId!
  }

  get decision(): Decision | null {
    return this.latestDecision
  }

  on(listener: Listener): void {
    this.listeners.add(listener)
  }

  off(listener: Listener): void {
    this.listeners.delete(listener)
  }

  async init(): Promise<string> {
    if (!this.sessionId) {
      const res = await fetch(`${this.gatewayUrl}/stealthguard/session/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: this.page }),
      })
      if (!res.ok) throw new Error(`session/init failed: ${res.status}`)
      const body = (await res.json()) as { session_id: string }
      this._sessionId = body.session_id
    }
    this.attachListeners()
    if (this.flushIntervalMs > 0) {
      this.timer = setInterval(() => void this.flush(), this.flushIntervalMs)
    }
    return this._sessionId!
  }

  /** One-line entry point (Phase 9 B2): init() + auto-instrument matching
   *  elements so a minimal integration is genuinely one line. */
  async start(): Promise<string> {
    const sessionId = await this.init()
    if (this.autoInstrument && !this.instrumented) {
      this.instrumented = true
      this.observeForms()
    }
    return sessionId
  }

  destroy(): void {
    this.detachListeners()
    this.detachInstrumentation()
    if (this.timer !== null) clearInterval(this.timer)
  }

  private observeForms(): void {
    this.instrumentForms(document.querySelectorAll(this.selector))
    if (typeof MutationObserver !== 'undefined' && document.body) {
      this.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLFormElement) this.instrumentForm(node)
            else if (node instanceof Element)
              this.instrumentForms(node.querySelectorAll(this.selector))
          }
        }
      })
      this.observer.observe(document.body, { childList: true, subtree: true })
    }
  }

  private instrumentForms(forms: NodeListOf<HTMLFormElement> | HTMLFormElement[]): void {
    for (const form of forms) this.instrumentForm(form)
  }

  private instrumentForm(form: HTMLFormElement): void {
    if (this.instrumentedForms.has(form)) return
    this.instrumentedForms.add(form)
    form.addEventListener('submit', this.onFormSubmit)
  }

  private detachInstrumentation(): void {
    this.observer?.disconnect()
    this.observer = null
  }

  private readonly onFormSubmit = (): void => {
    void this.flush()
  }

  async flush(): Promise<Decision | null> {
    if (!this._sessionId) return null
    const payload = this.buildPayload()
    if (!payload) return null
    try {
      const res = await fetch(`${this.gatewayUrl}/stealthguard/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`telemetry failed: ${res.status}`)
      const decision = (await res.json()) as Decision
      this.latestDecision = decision
      this.clearBuffers()
      this.emit(decision)
      return decision
    } catch (err) {
      // Keep the buffer for the next flush; the gateway fails safe server-side.
      console.warn('[stealthguard] flush failed', err)
      return null
    }
  }

  async respondChallenge(response: string, challengeType = 'math'): Promise<Decision | null> {
    if (!this._sessionId) return null
    const res = await fetch(`${this.gatewayUrl}/stealthguard/challenge/${this.sessionId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge_type: challengeType, response }),
    })
    if (!res.ok) throw new Error(`challenge respond failed: ${res.status}`)
    const decision = (await res.json()) as Decision
    this.latestDecision = decision
    this.emit(decision)
    return decision
  }

  /** Feature vector computed client-side (aggregated/privacy mode). */
  computeFeaturesClientSide(): RawTelemetry {
    return {
      keystrokes: this.keystrokes,
      mouse_moves: this.mouseMoves,
      touch_moves: this.touchMoves,
      clicks: this.clicks,
      signals: this.signals(),
    }
  }

  private signals(): { paste_events: number; keyless_fills: number; input_modality: string } {
    return {
      paste_events: this.pasteEvents,
      keyless_fills: this.keylessFills,
      input_modality: this.modality(),
    }
  }

  private modality(): 'mouse' | 'touch' | 'keyboard' {
    return this.sawTouch ? 'touch' : this.sawMouse ? 'mouse' : 'keyboard'
  }

  private buildPayload(): Record<string, unknown> | null {
    if (
      this.keystrokes.length === 0 &&
      this.mouseMoves.length === 0 &&
      this.touchMoves.length === 0 &&
      this.clicks.length === 0 &&
      this.pasteEvents === 0 &&
      this.keylessFills === 0
    ) {
      return null
    }
    const base: Record<string, unknown> = {
      session_id: this.sessionId,
      page: this.page,
      timestamp: new Date().toISOString(),
      sdk_version: this.sdkVersion,
      privacy_mode: this.privacyMode,
      signals: this.signals(),
      meta: this.meta(),
    }
    if (this.privacyMode === 'aggregated') {
      base.features = computeFeatures(this.computeFeaturesClientSide())
    } else {
      base.keystrokes = this.keystrokes
      base.mouse_moves = this.mouseMoves
      base.touch_moves = this.touchMoves
      base.clicks = this.clicks
    }
    return base
  }

  private meta(): TelemetryMeta {
    return {
      user_agent: navigator.userAgent,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      timezone_offset: -new Date().getTimezoneOffset(),
      input_modality: this.modality(),
    }
  }

  private clearBuffers(): void {
    this.keystrokes = []
    this.mouseMoves = []
    this.touchMoves = []
    this.clicks = []
  }

  private emit(decision: Decision): void {
    for (const listener of this.listeners) listener(decision)
  }

  private push<T>(buffer: T[], event: T): void {
    buffer.push(event)
    if (buffer.length > this.maxEventsPerType) buffer.shift()
  }

  private now(): number {
    return Date.now() / 1000
  }

  // --- listeners ---

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    this.keysDown.set(e.key, this.now())
    this.focusedKeydowns++
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const down = this.keysDown.get(e.key)
    if (down === undefined) return
    this.keysDown.delete(e.key)
    const up = this.now()
    this.push(this.keystrokes, { key: e.key, down_time: down, up_time: up })
    this._onKeystroke?.({ key: e.key, holdMs: Math.round((up - down) * 1000) })
  }

  private readonly onPaste = (): void => {
    this.pasteEvents++
  }

  private readonly onFocusIn = (): void => {
    this.focusedKeydowns = 0
  }

  private readonly onFocusOut = (): void => {
    // A field that was focused with zero keydowns was filled by autofill or
    // assistive software, not typed — a strong, privacy-safe signal (Phase 9 A1).
    if (this.focusedKeydowns === 0) this.keylessFills++
    this.focusedKeydowns = 0
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.sawMouse = true
    const t = this.now()
    this.push(this.mouseMoves, { x: e.clientX, y: e.clientY, t })
    this._onMouseMove?.({ x: e.clientX, y: e.clientY, t })
  }

  private readonly onTouchMove = (e: TouchEvent): void => {
    this.sawTouch = true
    for (const touch of e.touches) {
      this.push(this.touchMoves, { x: touch.clientX, y: touch.clientY, t: this.now() })
    }
  }

  private readonly onClick = (e: MouseEvent): void => {
    this.push(this.clicks, { x: e.clientX, y: e.clientY, t: this.now() })
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') void this.flush()
  }

  private readonly onBeforeUnload = (): void => {
    const payload = this.buildPayload()
    if (!payload || !navigator.sendBeacon) return
    navigator.sendBeacon(
      `${this.gatewayUrl}/stealthguard/telemetry`,
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    )
  }

  private attachListeners(): void {
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('touchmove', this.onTouchMove)
    document.addEventListener('click', this.onClick)
    document.addEventListener('paste', this.onPaste)
    document.addEventListener('focusin', this.onFocusIn)
    document.addEventListener('focusout', this.onFocusOut)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('beforeunload', this.onBeforeUnload)
  }

  private detachListeners(): void {
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('touchmove', this.onTouchMove)
    document.removeEventListener('click', this.onClick)
    document.removeEventListener('paste', this.onPaste)
    document.removeEventListener('focusin', this.onFocusIn)
    document.removeEventListener('focusout', this.onFocusOut)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('beforeunload', this.onBeforeUnload)
  }
}

export type { DecisionValue }

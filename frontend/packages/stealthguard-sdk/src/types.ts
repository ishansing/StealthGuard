export type DecisionValue = 'allow' | 'block' | 'challenge'
export type PrivacyMode = 'raw' | 'aggregated'

export interface ReasonCode {
  code: string
  weight: number
}

export interface Decision {
  session_id: string
  decision: DecisionValue
  humanness_score: number | null
  model_version: string | null
  reason_codes: ReasonCode[]
}

export interface TelemetryMeta {
  user_agent: string
  viewport_width: number
  viewport_height: number
  timezone_offset: number
  input_modality: 'mouse' | 'touch' | 'keyboard'
}

export interface StealthGuardOptions {
  /** Base URL of the StealthGuard gateway, e.g. http://localhost:8080 */
  gatewayUrl: string
  page?: string
  flushIntervalMs?: number
  maxEventsPerType?: number
  /** In aggregated mode only the client-computed feature vector is sent (§6.2). */
  privacyMode?: PrivacyMode
  /** Reuse an existing session instead of calling /session/init. */
  sessionId?: string
  /** One-line integration (Phase 9 B2): discover matching elements and attach
   *  a submit->flush listener automatically via start(). */
  autoInstrument?: boolean
  /** CSS selector for autoInstrument (default "form"). */
  selector?: string
}

export const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8080'

export interface SessionSummary {
  session_id: string
  page: string | null
  created_at: string
  user_agent: string | null
  input_modality: string | null
  decision: string | null
  humanness_score: number | null
  model_version: string | null
}

export interface ReasonCode {
  code: string
  weight: number
}

export interface TelemetryEvent {
  id: number
  event_type: string
  payload: Record<string, number | string | null>
  timestamp: string
}

export interface SessionDetail extends SessionSummary {
  reason_codes: ReasonCode[]
  events: TelemetryEvent[]
}

export interface Stats {
  decisions: Record<string, number>
  labels: Record<string, number>
  score_histogram: Record<string, number>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchSessions(page = 0, size = 20): Promise<{ content: SessionSummary[] }> {
  return get(`/stealthguard/admin/sessions?page=${page}&size=${size}`)
}

export function fetchStats(): Promise<Stats> {
  return get('/stealthguard/admin/stats')
}

export function fetchSession(id: string): Promise<SessionDetail> {
  return get(`/stealthguard/admin/sessions/${id}`)
}

export async function postFeedback(
  sessionId: string,
  reviewer: string,
  correctedLabel: string,
): Promise<void> {
  const res = await fetch(`${GATEWAY_URL}/stealthguard/admin/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, reviewer, corrected_label: correctedLabel }),
  })
  if (!res.ok) throw new Error(`feedback: ${res.status}`)
}

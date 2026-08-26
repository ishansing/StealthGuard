/** Feature vector keys (must match ml-service/app/features.py FEATURE_NAMES). */
export const FEATURE_NAMES = [
  'keystroke_mean_hold_ms',
  'keystroke_std_hold_ms',
  'keystroke_mean_interkey_ms',
  'keystroke_std_interkey_ms',
  'typing_speed_chars_per_s',
  'mouse_mean_speed_px_per_s',
  'mouse_std_speed_px_per_s',
  'mouse_path_efficiency',
  'mouse_idle_ratio',
  'mouse_direction_changes',
  'session_duration_ms',
  'event_count',
] as const

export type FeatureName = (typeof FEATURE_NAMES)[number]
export type Features = Record<FeatureName, number>

/** Raw telemetry input shape (SPEC §6.2), as the /features endpoint consumes it. */
export interface RawTelemetry {
  keystrokes?: Array<{ key?: string | null; down_time?: number | null; up_time?: number | null }>
  mouse_moves?: Array<{ x?: number | null; y?: number | null; t?: number | null }>
  touch_moves?: Array<{ x?: number | null; y?: number | null; t?: number | null }>
  clicks?: Array<{ x?: number | null; y?: number | null; t?: number | null }>
}

// Mirror of the canonical constants in features.py.
const IDLE_THRESHOLD_MS = 1000.0
const DIRECTION_CHANGE_THRESHOLD_RAD = Math.PI / 4 // 45 degrees
const MIN_DT_MS = 1.0
const MIN_DURATION_MS = 1e-6
const MIN_DIST = 1e-9

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function std(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function directionChanges(points: Array<[number, number]>): number {
  const segs: Array<[number, number]> = []
  for (const [p0, p1] of consecutive(points)) {
    const dx = p1[0] - p0[0]
    const dy = p1[1] - p0[1]
    if (dx === 0 && dy === 0) continue
    segs.push([dx, dy])
  }
  let changes = 0
  for (const [a, b] of consecutive(segs)) {
    const dot = a[0] * b[0] + a[1] * b[1]
    const cross = Math.abs(a[0] * b[1] - a[1] * b[0])
    if (Math.atan2(cross, dot) > DIRECTION_CHANGE_THRESHOLD_RAD) changes++
  }
  return changes
}

function* consecutive<T>(items: T[]): Generator<[T, T]> {
  for (let i = 1; i < items.length; i++) yield [items[i - 1], items[i]]
}

/**
 * Canonical feature formulas (SPEC §9.2), a byte-for-byte port of
 * ml-service/app/features.py. The parity test enforces numeric equality.
 */
export function computeFeatures(raw: RawTelemetry): Features {
  const keys = raw.keystrokes ?? []
  const moves = raw.mouse_moves ?? []
  const touches = raw.touch_moves ?? []
  const clicks = raw.clicks ?? []

  const timestamps: number[] = []
  const holds: number[] = []
  const downTimes: number[] = []

  for (const k of keys) {
    const down = k.down_time
    const up = k.up_time
    if (down !== undefined && down !== null) {
      timestamps.push(down)
      downTimes.push(down)
    }
    if (up !== undefined && up !== null) timestamps.push(up)
    if (down !== undefined && down !== null && up !== undefined && up !== null) {
      holds.push((up - down) * 1000)
    }
  }

  const interkeys: number[] = []
  for (const [a, b] of consecutive(downTimes)) interkeys.push((b - a) * 1000)

  const allMoves: Array<[number, number, number]> = []
  for (const m of [...moves, ...touches]) {
    if (
      m.x !== undefined &&
      m.x !== null &&
      m.y !== undefined &&
      m.y !== null &&
      m.t !== undefined &&
      m.t !== null
    ) {
      allMoves.push([m.x, m.y, m.t])
      timestamps.push(m.t)
    }
  }
  for (const c of clicks) {
    if (c.t !== undefined && c.t !== null) timestamps.push(c.t)
  }

  let durationMs = 0
  if (timestamps.length > 0) {
    durationMs = Math.max(0, (Math.max(...timestamps) - Math.min(...timestamps)) * 1000)
  }
  if (durationMs < MIN_DURATION_MS) durationMs = 0
  const durationS = durationMs / 1000

  const speeds: number[] = []
  const segDists: number[] = []
  const segTimes: number[] = []
  for (const [p0, p1] of consecutive(allMoves)) {
    const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    const dtMs = (p1[2] - p0[2]) * 1000
    if (dist > 0 && dtMs >= MIN_DT_MS) {
      speeds.push(dist / (dtMs / 1000))
      segDists.push(dist)
      segTimes.push(dtMs)
    }
  }

  const totalDist = segDists.reduce((a, b) => a + b, 0)
  let straight = 0
  if (allMoves.length >= 2) {
    straight = Math.hypot(
      allMoves[allMoves.length - 1][0] - allMoves[0][0],
      allMoves[allMoves.length - 1][1] - allMoves[0][1],
    )
  }
  const pathEfficiency = totalDist >= MIN_DIST ? straight / totalDist : 0

  const activeMs = segTimes.reduce((acc, dt) => acc + Math.min(dt, IDLE_THRESHOLD_MS), 0)
  const idleRatio = durationMs > 0 ? 1 - activeMs / durationMs : 0

  const typingSpeed = durationS > 0 ? keys.length / durationS : 0

  return {
    keystroke_mean_hold_ms: mean(holds),
    keystroke_std_hold_ms: std(holds),
    keystroke_mean_interkey_ms: mean(interkeys),
    keystroke_std_interkey_ms: std(interkeys),
    typing_speed_chars_per_s: typingSpeed,
    mouse_mean_speed_px_per_s: mean(speeds),
    mouse_std_speed_px_per_s: std(speeds),
    mouse_path_efficiency: pathEfficiency,
    mouse_idle_ratio: idleRatio,
    mouse_direction_changes: directionChanges(allMoves.map((m) => [m[0], m[1]])),
    session_duration_ms: durationMs,
    event_count: keys.length + allMoves.length + clicks.length,
  }
}

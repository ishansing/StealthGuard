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
  'fitts_fit_error_ms',
  'arrival_to_click_latency_ms',
  'micro_tremor_px_per_s2',
  'digraph_mean_latency_ms',
  'digraph_std_latency_ms',
  'paste_event_count',
  'keyless_fill_count',
  'input_modality',
  'keystroke_share',
] as const

export type FeatureName = (typeof FEATURE_NAMES)[number]
export type Features = Record<FeatureName, number>

/** Raw telemetry input shape (SPEC §6.2 + Phase 9 signals), as /features consumes it. */
export interface RawTelemetry {
  keystrokes?: Array<{ key?: string | null; down_time?: number | null; up_time?: number | null }>
  mouse_moves?: Array<{ x?: number | null; y?: number | null; t?: number | null }>
  touch_moves?: Array<{ x?: number | null; y?: number | null; t?: number | null }>
  clicks?: Array<{ x?: number | null; y?: number | null; t?: number | null }>
  signals?: {
    paste_events?: number | null
    keyless_fills?: number | null
    input_modality?: string | null
  }
}

// Mirror of the canonical constants in features.py.
const IDLE_THRESHOLD_MS = 1000.0
const DIRECTION_CHANGE_THRESHOLD_RAD = Math.PI / 4 // 45 degrees
const MIN_DT_MS = 1.0
const MIN_DURATION_MS = 1e-6
const MIN_DIST = 1e-9
const FITTS_W0 = 30.0
const FITTS_ARRIVAL_R = FITTS_W0 / 2.0
const FITTS_APPROACH_WINDOW = 8
const DIGRAPH_TOP_K = 5

const MODALITY_MAP: Record<string, number> = { mouse: 0, keyboard: 1, touch: 2, switch: 3 }

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

type Move = [number, number, number]

function clickApproaches(
  clicks: Array<[number, number, number]>,
  allMoves: Move[],
): { latencies: number[]; approaches: Array<[number, number]> } {
  const latencies: number[] = []
  const approaches: Array<[number, number]> = []
  for (const [cx, cy, ct] of clicks) {
    const prior = allMoves.filter(([, , t]) => t < ct)
    if (prior.length === 0) continue

    let arrivalT: number | null = null
    let prevInside = false
    for (const [x, y, t] of prior) {
      const inside = Math.hypot(x - cx, y - cy) <= FITTS_ARRIVAL_R
      if (inside && !prevInside) arrivalT = t
      prevInside = inside
    }
    if (arrivalT === null) continue
    latencies.push((ct - arrivalT) * 1000)

    const window = prior.filter(([, , t]) => t <= arrivalT).slice(-FITTS_APPROACH_WINDOW)
    if (window.length === 0) continue
    const start = window.reduce((a, b) =>
      Math.hypot(a[0] - cx, a[1] - cy) >= Math.hypot(b[0] - cx, b[1] - cy) ? a : b,
    )
    const dist = Math.hypot(start[0] - cx, start[1] - cy)
    const movementMs = (ct - start[2]) * 1000
    const fittsId = Math.log2(dist / FITTS_W0 + 1)
    approaches.push([fittsId, movementMs])
  }
  return { latencies, approaches }
}

function fittsFitError(approaches: Array<[number, number]>): number {
  if (approaches.length < 2) return 0
  const xs = approaches.map(([x]) => x)
  const ys = approaches.map(([, y]) => y)
  const mx = mean(xs)
  const denom = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0)
  if (denom < 1e-9) return 0
  const my = mean(ys)
  const b = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0) / denom
  const a = my - b * mx
  const mse = mean(approaches.map(([x, y]) => (y - (a + b * x)) ** 2))
  return Math.sqrt(mse)
}

function microTremor(allMoves: Move[]): number {
  const minDt = MIN_DT_MS / 1000
  const accels: number[] = []
  for (let i = 2; i < allMoves.length; i++) {
    const [x0, y0, t0] = allMoves[i - 2]
    const [x1, y1, t1] = allMoves[i - 1]
    const [x2, y2, t2] = allMoves[i]
    const dt0 = t1 - t0
    const dt1 = t2 - t1
    if (dt0 < minDt || dt1 < minDt) continue
    const ax = (x2 - 2 * x1 + x0) / (dt0 * dt1)
    const ay = (y2 - 2 * y1 + y0) / (dt0 * dt1)
    accels.push(Math.hypot(ax, ay))
  }
  return mean(accels)
}

function digraphTiming(
  downTimes: number[],
  keys: Array<{ key?: string | null }>,
): [number, number] {
  const pairLat = new Map<string, number[]>()
  for (let i = 0; i < keys.length - 1; i++) {
    const ki = keys[i].key
    const kj = keys[i + 1].key
    if (ki === undefined || ki === null || kj === undefined || kj === null) continue
    const pair = `${ki}\u0000${kj}`
    const list = pairLat.get(pair) ?? []
    list.push((downTimes[i + 1] - downTimes[i]) * 1000)
    pairLat.set(pair, list)
  }
  const top = [...pairLat.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, DIGRAPH_TOP_K)
  const all: number[] = top.flatMap(([, lats]) => lats)
  return [mean(all), std(all)]
}

function sigFloat(signals: RawTelemetry['signals'], key: 'paste_events' | 'keyless_fills'): number {
  const value = signals?.[key]
  if (value === undefined || value === null) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Canonical feature formulas (SPEC §9.2 + Phase 9 A1/A5), a byte-for-byte port
 * of ml-service/app/features.py. The parity test enforces numeric equality.
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

  const allMoves: Move[] = []
  for (const m of [...moves, ...touches]) {
    if (m.x !== undefined && m.x !== null && m.y !== undefined && m.y !== null && m.t !== undefined && m.t !== null) {
      allMoves.push([m.x, m.y, m.t])
      timestamps.push(m.t)
    }
  }

  const clickPoints: Array<[number, number, number]> = []
  for (const c of clicks) {
    if (c.t !== undefined && c.t !== null) {
      timestamps.push(c.t)
      clickPoints.push([c.x ?? 0, c.y ?? 0, c.t])
    }
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

  const { latencies, approaches } = clickApproaches(clickPoints, allMoves)
  const [digraphMean, digraphStd] = digraphTiming(downTimes, keys)

  const modality = String(raw.signals?.input_modality ?? 'mouse').toLowerCase()
  const inputModality = MODALITY_MAP[modality] ?? 0
  const pasteEvents = sigFloat(raw.signals, 'paste_events')
  const keylessFills = sigFloat(raw.signals, 'keyless_fills')
  const totalEvents = keys.length + allMoves.length + clickPoints.length
  const keystrokeShare = totalEvents > 0 ? keys.length / totalEvents : 0

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
    event_count: totalEvents,
    fitts_fit_error_ms: fittsFitError(approaches),
    arrival_to_click_latency_ms: mean(latencies),
    micro_tremor_px_per_s2: microTremor(allMoves),
    digraph_mean_latency_ms: digraphMean,
    digraph_std_latency_ms: digraphStd,
    paste_event_count: pasteEvents,
    keyless_fill_count: keylessFills,
    input_modality: inputModality,
    keystroke_share: keystrokeShare,
  }
}
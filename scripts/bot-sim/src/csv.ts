import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SessionPlan } from './personas'

/**
 * Writes the labeled training CSV (one row per event) and per-session raw
 * telemetry logs. CSV columns match ml-service/training/train.py:
 * session_id,label,event_type,ts,key,down_time,up_time,x,y
 */

export function initCsv(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'session_id,label,event_type,ts,key,down_time,up_time,x,y\n')
}

export function appendPlanToCsv(csvPath: string, plan: SessionPlan): void {
  const rows: string[] = []
  for (const k of plan.keystrokes) {
    rows.push(`${plan.session_id},${plan.label},keystroke,,${k.key},${k.down_time},${k.up_time},,`)
  }
  for (const m of plan.mouse_moves) {
    rows.push(`${plan.session_id},${plan.label},mouse_move,${m.t},,,,${m.x},${m.y}`)
  }
  for (const m of plan.touch_moves) {
    rows.push(`${plan.session_id},${plan.label},touch_move,${m.t},,,,${m.x},${m.y}`)
  }
  for (const c of plan.clicks) {
    rows.push(`${plan.session_id},${plan.label},click,${c.t},,,,${c.x},${c.y}`)
  }
  appendFileSync(csvPath, rows.join('\n') + '\n')
}

export function writeRawLog(dir: string, plan: SessionPlan): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${plan.session_id}.json`), JSON.stringify(plan, null, 2))
}
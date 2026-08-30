import { describe, expect, it } from 'vitest'

import { humanPlan, jitterPlan, naivePlan, seededRng } from './personas'
import type { SessionPlan } from './personas'

function interkeyStd(plan: SessionPlan): number {
  const downs = plan.keystrokes.map((k) => k.down_time)
  const gaps = downs.slice(1).map((d, i) => d - downs[i])
  if (gaps.length === 0) return 0
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length
  return Math.sqrt(variance)
}

function pathEfficiency(plan: SessionPlan): number {
  const m = plan.mouse_moves
  let total = 0
  for (let i = 1; i < m.length; i++) total += Math.hypot(m[i].x - m[i - 1].x, m[i].y - m[i - 1].y)
  const straight = m.length > 1 ? Math.hypot(m[m.length - 1].x - m[0].x, m[m.length - 1].y - m[0].y) : 0
  return total > 0 ? straight / total : 0
}

describe('persona statistical sanity (SPEC §15 Phase 6)', () => {
  it('naive has near-zero keystroke interval variance and a straight mouse path', () => {
    const plan = naivePlan('naive-1')
    expect(interkeyStd(plan)).toBeLessThan(1e-9)
    expect(pathEfficiency(plan)).toBeGreaterThan(0.99)
  })

  it('scripted-jitter has small but nonzero interval variance, still separable from human', () => {
    const jitter = interkeyStd(jitterPlan('jitter-1', seededRng(7)))
    expect(jitter).toBeGreaterThan(0)
    expect(jitter).toBeLessThan(0.01)
  })

  it('human variance clearly exceeds scripted-jitter variance', () => {
    const human = interkeyStd(humanPlan('human-1', seededRng(11)))
    const jitter = interkeyStd(jitterPlan('jitter-1', seededRng(13)))
    expect(human).toBeGreaterThan(jitter * 2)
  })
})
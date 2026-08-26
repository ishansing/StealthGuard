import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { computeFeatures } from './feature-extraction'

// /fixtures/feature-parity.json is generated from the canonical Python
// implementation; both suites assert the same numbers (SPEC §12 parity).
// Walk upward to find it — the host and the docker image have different roots.
function findFixture(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'fixtures', 'feature-parity.json')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  throw new Error('fixtures/feature-parity.json not found')
}

const FIXTURE = findFixture()

interface Case {
  name: string
  input: Parameters<typeof computeFeatures>[0]
  expected: Record<string, number>
}

describe('feature extraction parity with ml-service', () => {
  const data = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as { cases: Case[] }

  it('loads a fixture with cases', () => {
    expect(data.cases.length).toBeGreaterThan(0)
  })

  it('computes features matching the canonical Python vectors within epsilon', () => {
    for (const c of data.cases) {
      const actual = computeFeatures(c.input)
      for (const [feature, expected] of Object.entries(c.expected)) {
        const got = actual[feature as keyof typeof actual]
        expect(typeof got, `${c.name} ${feature}`).toBe('number')
        const tolerance = 1e-6 * Math.max(1, Math.abs(expected))
        expect(
          Math.abs(got - expected),
          `${c.name} ${feature}: ${got} != ${expected}`,
        ).toBeLessThanOrEqual(tolerance)
      }
    }
  })
})

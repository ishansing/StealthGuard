import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Stats } from '../api'
import { StatsCharts } from './StatsCharts'

const STATS: Stats = {
  decisions: { allow: 8, block: 5, challenge: 3 },
  labels: { human: 8, bot: 5 },
  score_histogram: { '8': 5, '9': 3, '0': 4, '4': 1 },
}

describe('StatsCharts', () => {
  it('renders a histogram bar per score bucket', () => {
    render(<StatsCharts stats={STATS} />)
    expect(screen.getByTestId('histogram')).toBeTruthy()
    expect(screen.getByTestId('hist-8').getAttribute('title')).toContain('5')
    expect(screen.getByTestId('hist-0').getAttribute('title')).toContain('4')
    expect(screen.getByTestId('hist-3').getAttribute('title')).toContain('0')
  })

  it('renders the decision funnel counts', () => {
    render(<StatsCharts stats={STATS} />)
    expect(screen.getByTestId('funnel-allow').textContent).toBe('8')
    expect(screen.getByTestId('funnel-block').textContent).toBe('5')
    expect(screen.getByTestId('funnel-challenge').textContent).toBe('3')
  })
})

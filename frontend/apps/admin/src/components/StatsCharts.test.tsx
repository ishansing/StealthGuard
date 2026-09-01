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
  it('renders stat cards with correct totals', () => {
    render(<StatsCharts stats={STATS} />)
    expect(screen.getByText('TOTAL SESSIONS')).toBeTruthy()
    expect(screen.getByText('16')).toBeTruthy()
    expect(screen.getByText('BOT TRAFFIC')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('HUMAN TRAFFIC')).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
  })

  it('shows placeholder when stats are null', () => {
    render(<StatsCharts stats={null} />)
    expect(screen.getByText('TOTAL SESSIONS')).toBeTruthy()
    const values = screen.getAllByText('—')
    expect(values.length).toBeGreaterThanOrEqual(4)
  })
})

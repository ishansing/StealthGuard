import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SessionTable } from './SessionTable'
import type { SessionSummary } from '../api'

const SESSION: SessionSummary = {
  session_id: 'aaaaaaaa-1111-2222-3333-444444444444',
  page: '/login',
  created_at: '2026-08-26T10:00:00Z',
  user_agent: 'test-agent',
  input_modality: 'mouse',
  decision: 'block',
  humanness_score: 0.1,
  model_version: 'rule-based',
}

describe('SessionTable', () => {
  it('activates a row via mouse click', () => {
    const onSelect = vi.fn()
    render(<SessionTable sessions={[SESSION]} selectedId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId(`session-row-${SESSION.session_id}`))
    expect(onSelect).toHaveBeenCalledWith(SESSION.session_id)
  })

  it('activates a row via Enter key (keyboard-operable)', () => {
    const onSelect = vi.fn()
    render(<SessionTable sessions={[SESSION]} selectedId={null} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByTestId(`session-row-${SESSION.session_id}`), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(SESSION.session_id)
  })

  it('uses a stable session id as the React key, not the array index', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SessionTable sessions={[SESSION, SESSION]} selectedId={null} onSelect={onSelect} />,
    )
    expect(container.querySelectorAll('tr[tabindex]')).toHaveLength(2)
  })
})

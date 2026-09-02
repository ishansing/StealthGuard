import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Button, IconButton, LinkButton } from './index'

describe('Button', () => {
  it('renders a real <button> element with the required type', () => {
    render(<Button type="submit">Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('type')).toBe('submit')
  })

  it('fires onClick exactly once per click', () => {
    const onClick = vi.fn()
    render(
      <Button type="button" onClick={onClick}>
        Go
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Go' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('fires onClick only once during a pending async action (double-click guard)', async () => {
    const onClick = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    render(
      <Button type="button" onClick={onClick}>
        Submit
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Submit' })

    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect((btn as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks activation while disabled, not just visually', () => {
    const onClick = vi.fn()
    render(
      <Button type="button" disabled onClick={onClick}>
        Go
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('blocks activation while loading', () => {
    const onClick = vi.fn()
    render(
      <Button type="button" loading onClick={onClick}>
        Go
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('exposes an accessible name even while loading', () => {
    render(
      <Button type="button" loading>
        Analyzing
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Analyzing' })).toBeTruthy()
  })

  it('is keyboard-operable because it is a real button', () => {
    render(<Button type="button">Tab me</Button>)
    expect(screen.getByRole('button', { name: 'Tab me' })).toHaveProperty('tabIndex', 0)
  })
})

describe('IconButton', () => {
  it('renders an icon-only button with an accessible name', () => {
    render(<IconButton type="button" icon="settings" label="Open settings" />)
    const btn = screen.getByRole('button', { name: 'Open settings' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('aria-label')).toBe('Open settings')
  })
})

describe('LinkButton', () => {
  it('renders a real <a> for navigation', () => {
    render(<LinkButton href="/admin">Admin</LinkButton>)
    const link = screen.getByRole('link', { name: 'Admin' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/admin')
  })
})

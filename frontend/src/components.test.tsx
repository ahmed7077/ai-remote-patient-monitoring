// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, ErrorState, SkeletonBlock, StatusBadge } from './components'

afterEach(cleanup)

describe('shared state components', () => {
  it.each([
    ['NORMAL', 'Normal'],
    ['SUSPECT', 'Suspect'],
    ['HIGH_RISK', 'Critical'],
    ['SIMULATED', 'Simulated'],
    ['PROTOTYPE', 'Prototype'],
  ] as const)('maps %s to an icon and visible label', (status, label) => {
    const { container } = render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders an intentional empty state', () => {
    render(<EmptyState title="No measurements yet" body="Readings will appear after monitoring begins." />)
    expect(screen.getByText('No measurements yet')).toBeTruthy()
    expect(screen.getByText(/after monitoring begins/)).toBeTruthy()
  })

  it('renders content-shaped skeleton blocks', () => {
    const { container } = render(<SkeletonBlock variant="row" count={3} />)
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3)
  })

  it('wires error recovery to the provided retry action', () => {
    const retry = vi.fn()
    render(<ErrorState message="Connection unavailable" retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

import { describe, expect, it } from 'vitest'

import type { RiskLevel } from './types'

describe('risk status contract', () => {
  it('retains the backend risk vocabulary', () => {
    const levels: RiskLevel[] = ['NORMAL', 'WARNING', 'HIGH_RISK']
    expect(levels).toHaveLength(3)
  })
})

import { describe, expect, it } from 'vitest'

import type { MeasurementSource, RiskLevel, VitalType } from './types'

describe('risk status contract', () => {
  it('retains the backend risk vocabulary', () => {
    const levels: RiskLevel[] = ['NORMAL', 'WARNING', 'HIGH_RISK']
    expect(levels).toHaveLength(3)
  })

  it('models the active physical-device measurement contract', () => {
    const source: MeasurementSource = 'PHYSICAL_DEVICE'
    const activeVitals: VitalType[] = ['HEART_RATE', 'SPO2', 'TEMPERATURE', 'RESPIRATORY_RATE']
    expect(source).toBe('PHYSICAL_DEVICE')
    expect(activeVitals).toContain('RESPIRATORY_RATE')
  })
})

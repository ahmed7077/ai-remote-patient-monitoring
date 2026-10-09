// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import App from './App'
import { api } from './api'
import { AuthProvider } from './auth'
import type { DeviceRegistration, Patient, Role, Session, User } from './types'

const patientProfile: Patient = { id: 'profile-id', patient_code: 'PAT-001', display_name: 'Test Patient', linked_user_id: 'patient-id', created_at: '2026-01-01T00:00:00Z' }

function currentUser(role: Role): User {
  return { id: role === 'PATIENT' ? 'patient-id' : 'professional-id', full_name: role === 'PATIENT' ? 'Test Patient' : 'Test Professional', email: role === 'PATIENT' ? 'patient@example.com' : 'doctor@example.com', role, is_active: true }
}

function Location() { const location = useLocation(); return <output aria-label="current path">{location.pathname}</output> }

function renderAuthenticated(path: string, role: Role, patients: Patient[] = []) {
  vi.spyOn(api, 'hasToken').mockReturnValue(true)
  vi.spyOn(api, 'me').mockResolvedValue(currentUser(role))
  vi.spyOn(api, 'patients').mockResolvedValue(patients)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter></AuthProvider></QueryClientProvider>)
}

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('patient workspace navigation', () => {
  it.each([
    ['/patient/dashboard', 'No patient profile linked'],
    ['/patient/vitals', 'No measurements yet'],
    ['/patient/trends', 'Trend unavailable'],
    ['/patient/alerts', 'No alerts'],
    ['/patient/devices', 'No monitoring device linked'],
  ])('renders the direct route %s with an intentional empty state', async (path, emptyState) => {
    renderAuthenticated(path, 'PATIENT')
    expect(await screen.findByText(emptyState)).toBeTruthy()
    expect(screen.getByLabelText('current path').textContent).toBe(path)
  })

  it.each([
    ['Vitals', '/patient/vitals'],
    ['Trends', '/patient/trends'],
    ['Alerts', '/patient/alerts'],
    ['Devices', '/patient/devices'],
  ])('navigates to %s and marks it active', async (label, path) => {
    renderAuthenticated('/patient/dashboard', 'PATIENT')
    await screen.findByText('No patient profile linked')
    const link = screen.getByRole('link', { name: new RegExp(label) })
    await userEvent.click(link)
    await waitFor(() => expect(screen.getByLabelText('current path').textContent).toBe(path))
    expect(link.getAttribute('aria-current')).toBe('page')
  })

  it('keeps professional users out of patient routes', async () => {
    renderAuthenticated('/patient/vitals', 'HEALTHCARE_PROFESSIONAL')
    await waitFor(() => expect(screen.getByLabelText('current path').textContent).toBe('/doctor/dashboard'))
  })

  it('shows dated four-metric trends without sharing incompatible axes', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    const sessions: Session[] = ['2026-10-08T10:00:00Z', '2026-10-09T10:00:00Z'].map((recorded_at, index) => ({
      id: `session-${index}`, patient_id: patientProfile.id, device_id: 'device-id', recorded_at, received_at: recorded_at, source: 'PHYSICAL_DEVICE',
      measurements: [
        { vital_type: 'HEART_RATE', value: 72 + index, unit: 'bpm', quality_status: 'VALID' },
        { vital_type: 'SPO2', value: 98, unit: '%', quality_status: 'VALID' },
        { vital_type: 'TEMPERATURE', value: 36.7, unit: '°C', quality_status: 'VALID' },
        { vital_type: 'RESPIRATORY_RATE', value: 15 + index, unit: 'breaths/min', quality_status: 'VALID' },
      ],
    }))
    vi.spyOn(api, 'sessions').mockResolvedValue(sessions)
    renderAuthenticated('/patient/trends', 'PATIENT', [patientProfile])
    const selector = await screen.findByRole('tablist', { name: 'Trend legend and metric selector' })
    expect(selector.querySelectorAll('[role="tab"]')).toHaveLength(4)
    const respiratory = screen.getByRole('tab', { name: /Respiratory rate/ })
    await userEvent.click(respiratory)
    expect(respiratory.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Physical ESP32 data')).toBeTruthy()
  })
})

describe('professional workspace', () => {
  it('navigates to Patients and creates a linked assigned profile', async () => {
    const create = vi.spyOn(api, 'createPatient').mockResolvedValue(patientProfile)
    renderAuthenticated('/doctor/dashboard', 'HEALTHCARE_PROFESSIONAL')
    await userEvent.click(await screen.findByRole('link', { name: /Patients/ }))
    await screen.findByRole('heading', { name: 'Patients' })
    await userEvent.type(screen.getByLabelText('Patient code'), 'pat-001')
    await userEvent.type(screen.getByLabelText('Display name'), 'Test Patient')
    await userEvent.type(screen.getByLabelText(/Patient account email/), 'patient@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Create patient profile' }))
    await waitFor(() => expect(create.mock.calls[0]?.[0]).toEqual({ patient_code: 'PAT-001', display_name: 'Test Patient', linked_user_email: 'patient@example.com' }))
    expect(await screen.findByText('Patient profile created and assigned to you.')).toBeTruthy()
  })

  it('renders an assigned patient detail route from real API-shaped responses', async () => {
    vi.spyOn(api, 'sessions').mockResolvedValue([])
    vi.spyOn(api, 'risks').mockResolvedValue([])
    vi.spyOn(api, 'alerts').mockResolvedValue([])
    vi.spyOn(api, 'devices').mockResolvedValue([])
    const simulate = vi.spyOn(api, 'simulate').mockResolvedValue({ id: 'session-id', patient_id: 'profile-id', device_id: 'device-id', recorded_at: '2026-01-01T00:00:00Z', received_at: '2026-01-01T00:00:00Z', source: 'SIMULATED', measurements: [] })
    renderAuthenticated('/doctor/patients/profile-id', 'HEALTHCARE_PROFESSIONAL', [patientProfile])
    expect(await screen.findByRole('heading', { name: 'Test Patient' })).toBeTruthy()
    expect(screen.getByText('No assessment available')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'High risk' }))
    await waitFor(() => expect(simulate.mock.calls[0]?.slice(0, 2)).toEqual(['profile-id', 'high-risk']))
    expect(await screen.findByText(/Synthetic reading generated/)).toBeTruthy()
  })

  it('registers an ESP32 and reveals its credential once', async () => {
    vi.spyOn(api, 'devices').mockResolvedValue([])
    const registered: DeviceRegistration = { id: 'device-id', patient_id: patientProfile.id, device_uid: 'PB-ESP32-001', device_type: 'ESP32', status: 'OFFLINE', last_seen_at: null, firmware_version: '0.1.0', device_credential: 'one-time-device-secret' }
    const register = vi.spyOn(api, 'registerDevice').mockResolvedValue(registered)
    renderAuthenticated('/doctor/devices', 'HEALTHCARE_PROFESSIONAL', [patientProfile])
    await userEvent.selectOptions(await screen.findByLabelText('Patient'), patientProfile.id)
    await userEvent.type(screen.getByLabelText('Device UID'), 'PB-ESP32-001')
    await userEvent.type(screen.getByLabelText(/Firmware/), '0.1.0')
    await userEvent.click(screen.getByRole('button', { name: 'Register device' }))
    await waitFor(() => expect(register.mock.calls[0]?.[0]).toEqual({ patient_id: patientProfile.id, device_uid: 'PB-ESP32-001', device_type: 'ESP32', firmware_version: '0.1.0' }))
    expect(await screen.findByText('Copy this credential now')).toBeTruthy()
    expect(screen.getByText('one-time-device-secret')).toBeTruthy()
    expect(screen.getByText(/will not appear again/i)).toBeTruthy()
  })

  it('keeps patient users out of professional routes', async () => {
    renderAuthenticated('/doctor/patients', 'PATIENT')
    await waitFor(() => expect(screen.getByLabelText('current path').textContent).toBe('/patient/dashboard'))
  })
})

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import App from './App'
import { api } from './api'
import { AuthProvider } from './auth'
import type { Patient, Role, User } from './types'

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

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

describe('patient workspace navigation', () => {
  it.each([
    ['/patient/dashboard', 'No patient profile linked'],
    ['/patient/vitals', 'No measurements yet'],
    ['/patient/alerts', 'No alerts'],
    ['/patient/devices', 'No monitoring device linked'],
  ])('renders the direct route %s with an intentional empty state', async (path, emptyState) => {
    renderAuthenticated(path, 'PATIENT')
    expect(await screen.findByText(emptyState)).toBeTruthy()
    expect(screen.getByLabelText('current path').textContent).toBe(path)
  })

  it.each([
    ['Vitals', '/patient/vitals'],
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
    renderAuthenticated('/doctor/patients/profile-id', 'HEALTHCARE_PROFESSIONAL', [patientProfile])
    expect(await screen.findByRole('heading', { name: 'Test Patient' })).toBeTruthy()
    expect(screen.getByText('No assessment available')).toBeTruthy()
  })

  it('keeps patient users out of professional routes', async () => {
    renderAuthenticated('/doctor/patients', 'PATIENT')
    await waitFor(() => expect(screen.getByLabelText('current path').textContent).toBe('/patient/dashboard'))
  })
})

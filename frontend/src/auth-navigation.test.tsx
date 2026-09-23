// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import App from './App'
import { api } from './api'
import { AuthProvider } from './auth'
import type { Role, User } from './types'

function user(role: Role): User {
  return {
    id: role === 'PATIENT' ? 'patient-id' : 'professional-id',
    full_name: role === 'PATIENT' ? 'Test Patient' : 'Test Professional',
    email: role === 'PATIENT' ? 'patient@example.com' : 'doctor@example.com',
    role,
    is_active: true,
  }
}

function Location() {
  const location = useLocation()
  return <output aria-label="current path">{location.pathname}</output>
}

function renderApp(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
          <Location />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

function mockPatients() {
  vi.spyOn(api, 'patients').mockResolvedValue([])
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('authentication navigation', () => {
  it('redirects a successful patient login to the patient dashboard', async () => {
    vi.spyOn(api, 'hasToken').mockReturnValue(false)
    vi.spyOn(api, 'login').mockResolvedValue({
      access_token: 'access', refresh_token: 'refresh', token_type: 'bearer',
    })
    vi.spyOn(api, 'me').mockResolvedValue(user('PATIENT'))
    mockPatients()
    renderApp('/login')

    await userEvent.type(screen.getByLabelText('Email address'), 'patient@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a-secure-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(screen.getByLabelText('current path').textContent).toBe('/patient/dashboard'))
    expect(await screen.findByText('No patient profile linked')).toBeTruthy()
  })

  it('keeps a failed login on the login page and displays the API error', async () => {
    vi.spyOn(api, 'hasToken').mockReturnValue(false)
    vi.spyOn(api, 'login').mockRejectedValue(new Error('Incorrect email or password'))
    renderApp('/login')

    await userEvent.type(screen.getByLabelText('Email address'), 'patient@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'incorrect-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Incorrect email or password')
    expect(screen.getByLabelText('current path').textContent).toBe('/login')
  })

  it.each([
    ['PATIENT', '/patient/dashboard'],
    ['HEALTHCARE_PROFESSIONAL', '/doctor/dashboard'],
  ] as const)('redirects an authenticated %s away from login', async (role, dashboard) => {
    vi.spyOn(api, 'hasToken').mockReturnValue(true)
    vi.spyOn(api, 'me').mockResolvedValue(user(role))
    mockPatients()
    renderApp('/login')

    await waitFor(() => expect(screen.getByLabelText('current path').textContent).toBe(dashboard))
  })

  it('redirects unauthenticated protected-route access to login', async () => {
    vi.spyOn(api, 'hasToken').mockReturnValue(false)
    renderApp('/patient/dashboard')

    await waitFor(() => expect(screen.getByLabelText('current path').textContent).toBe('/login'))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  })

  it('restores authentication through the loading state without a redirect loop', async () => {
    let resolveUser!: (value: User) => void
    vi.spyOn(api, 'hasToken').mockReturnValue(true)
    const me = vi.spyOn(api, 'me').mockReturnValue(
      new Promise<User>((resolve) => { resolveUser = resolve }),
    )
    mockPatients()
    renderApp('/patient/dashboard')

    expect(screen.getByLabelText('Loading')).toBeTruthy()
    expect(screen.getByLabelText('current path').textContent).toBe('/patient/dashboard')
    resolveUser(user('PATIENT'))

    expect(await screen.findByText('No patient profile linked')).toBeTruthy()
    expect(screen.getByLabelText('current path').textContent).toBe('/patient/dashboard')
    expect(me).toHaveBeenCalledTimes(1)
  })
})

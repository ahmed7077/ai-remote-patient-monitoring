import { Activity, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'

import { dashboardFor, useAuth } from './auth'
import { Brand, Loading, Shell } from './components'
import {
  DoctorAlerts, DoctorDashboard, DoctorDevices, DoctorPatientDetail, DoctorPatients,
  PatientAlerts, PatientDashboard, PatientDevices, PatientVitals,
} from './dashboards'
import type { Role } from './types'

function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      if (register) {
        await auth.register({
          full_name: String(data.get('name')),
          email: String(data.get('email')),
          password: String(data.get('password')),
          role: String(data.get('role')) as Role,
        })
      }
      const user = await auth.login(String(data.get('email')), String(data.get('password')))
      navigate(dashboardFor(user.role), { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to continue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">CONTINUOUS CARE, CLEARLY PRESENTED</span>
          <h1>Vital context.<br />Thoughtful decisions.</h1>
          <p>A focused remote-monitoring workspace that turns incoming physiological readings into a clear, accountable care view.</p>
          <div className="trust"><ShieldCheck /><span><strong>Privacy-minded by design</strong><small>Role-scoped access and auditable actions</small></span></div>
        </div>
        <small>Academic software prototype · Not a medical device</small>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <div className="form-icon"><Activity /></div>
          <span className="eyebrow">PULSEBRIDGE ACCESS</span>
          <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
          <p>{register ? 'Set up secure access to the prototype workspace.' : 'Sign in to continue to your monitoring workspace.'}</p>
          {register && <>
            <label>Full name<input name="name" required minLength={2} autoComplete="name" /></label>
            <label>Account type<select name="role"><option value="PATIENT">Patient</option><option value="HEALTHCARE_PROFESSIONAL">Healthcare professional</option></select></label>
          </>}
          <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password<input name="password" type="password" required minLength={10} autoComplete={register ? 'new-password' : 'current-password'} /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}<ArrowRight /></button>
          <div className="switch">{register ? 'Already registered?' : 'New to PulseBridge?'} <button type="button" onClick={() => navigate(register ? '/login' : '/register')}>{register ? 'Sign in' : 'Create account'}</button></div>
          <div className="secure-note"><LockKeyhole /> Credentials are protected with Argon2id hashing.</div>
        </form>
      </section>
    </div>
  )
}

function PublicOnly({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'authenticated' && auth.user) {
    return <Navigate to={dashboardFor(auth.user.role)} replace />
  }
  return children
}

function ProtectedLayout({ role }: { role: Role }) {
  const auth = useAuth()
  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'unauthenticated' || !auth.user) return <Navigate to="/login" replace />
  if (auth.user.role !== role) return <Navigate to={dashboardFor(auth.user.role)} replace />
  return <Shell user={auth.user}><Outlet context={auth.user} /></Shell>
}

function AuthenticatedHome() {
  const auth = useAuth()
  if (auth.status === 'loading') return <Loading />
  if (!auth.user) return <Navigate to="/login" replace />
  return <Navigate to={dashboardFor(auth.user.role)} replace />
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<PublicOnly><AuthPage /></PublicOnly>} />
    <Route path="/register" element={<PublicOnly><AuthPage register /></PublicOnly>} />
    <Route element={<ProtectedLayout role="PATIENT" />}>
      <Route path="/patient/dashboard" element={<PatientDashboard />} />
      <Route path="/patient/vitals" element={<PatientVitals />} />
      <Route path="/patient/alerts" element={<PatientAlerts />} />
      <Route path="/patient/devices" element={<PatientDevices />} />
    </Route>
    <Route element={<ProtectedLayout role="HEALTHCARE_PROFESSIONAL" />}>
      <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
      <Route path="/doctor/patients" element={<DoctorPatients />} />
      <Route path="/doctor/patients/:patientId" element={<DoctorPatientDetail />} />
      <Route path="/doctor/alerts" element={<DoctorAlerts />} />
      <Route path="/doctor/devices" element={<DoctorDevices />} />
    </Route>
    <Route path="*" element={<AuthenticatedHome />} />
  </Routes>
}

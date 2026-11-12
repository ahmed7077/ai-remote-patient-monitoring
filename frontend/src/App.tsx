import { Activity, ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'

import { dashboardFor, useAuth } from './auth'
import { Brand, Loading, Shell } from './components'
import {
  DoctorAlerts, DoctorAnalytics, DoctorDashboard, DoctorFollowUps, DoctorPatientDetail, DoctorPatients,
  PatientAlerts, PatientAnalytics, PatientDashboard, PatientSummary, PatientTrends, PatientVitals,
} from './dashboards'
import type { Role } from './types'

function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      if (register) {
        await auth.register({
          full_name: String(data.get('name')).trim(),
          email: String(data.get('email')).trim(),
          password: String(data.get('password')),
          role: String(data.get('role')) as Role,
        })
      }
      const user = await auth.login(String(data.get('email')).trim(), String(data.get('password')))
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
        <div className="auth-current" aria-hidden="true">
          {[0, 1, 2].map(layer => <svg key={layer} className={`auth-wave auth-wave-${layer}`} viewBox="0 0 800 400" preserveAspectRatio="none" focusable="false">
            <path d={'M 0 200 ' + Array.from({ length: 8 }, (_, index) => {
              const x = index * 100
              return `C ${x + 24} 164, ${x + 26} 164, ${x + 50} 200 S ${x + 76} 236, ${x + 100} 200`
            }).join(' ')} />
          </svg>)}
        </div>
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
        <form onSubmit={submit} aria-busy={busy}>
          <div className="form-icon"><Activity /></div>
          <span className="eyebrow">PULSEBRIDGE ACCESS</span>
          <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
          <p>{register ? 'Set up secure access to the prototype workspace.' : 'Sign in to continue to your monitoring workspace.'}</p>
          {register && <>
            <label>Full name<input name="name" required minLength={2} autoComplete="name" /></label>
            <label>Account type<select name="role"><option value="PATIENT">Patient</option><option value="HEALTHCARE_PROFESSIONAL">Healthcare professional</option></select></label>
          </>}
          <label>Email address<input name="email" type="email" required autoComplete={register ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} /></label>
          <label htmlFor="access-password">Password</label>
          <div className="password-field">
            <input id="access-password" name="password" type={showPassword ? 'text' : 'password'} required minLength={register ? 10 : undefined} maxLength={register ? 128 : undefined} autoComplete={register ? 'new-password' : 'current-password'} aria-describedby={register ? 'password-hint' : undefined} onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))} onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} />
            <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
          </div>
          {register && <small id="password-hint" className="auth-hint">Use at least 10 characters. A longer passphrase works well.</small>}
          {capsLock && <small className="auth-hint" role="status">Caps Lock is on.</small>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}{busy ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</button>
          <div className="switch">{register ? 'Already registered?' : 'New to PulseBridge?'} <button type="button" disabled={busy} onClick={() => { setShowPassword(false); setError(''); navigate(register ? '/login' : '/register') }}>{register ? 'Sign in' : 'Create account'}</button></div>
          <div className="secure-note"><LockKeyhole /> Your workspace opens after sign-in.</div>
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
      <Route path="/patient/summary" element={<PatientSummary />} />
      <Route path="/patient/vitals" element={<PatientVitals />} />
      <Route path="/patient/trends" element={<PatientTrends />} />
      <Route path="/patient/analytics" element={<PatientAnalytics />} />
      <Route path="/patient/alerts" element={<PatientAlerts />} />
    </Route>
    <Route element={<ProtectedLayout role="HEALTHCARE_PROFESSIONAL" />}>
      <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
      <Route path="/doctor/patients" element={<DoctorPatients />} />
      <Route path="/doctor/patients/:patientId" element={<DoctorPatientDetail />} />
      <Route path="/doctor/follow-ups" element={<DoctorFollowUps />} />
      <Route path="/doctor/analytics" element={<DoctorAnalytics />} />
      <Route path="/doctor/alerts" element={<DoctorAlerts />} />
    </Route>
    <Route path="*" element={<AuthenticatedHome />} />
  </Routes>
}

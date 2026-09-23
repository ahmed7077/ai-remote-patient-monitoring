import {
  Activity, AlertTriangle, HeartPulse, LogOut, Menu, ShieldCheck, Users, X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from './auth'
import type { RiskLevel, User } from './types'

export function Brand() {
  return <div className="brand"><span className="brand-mark"><Activity /></span><span>PulseBridge<small>Remote monitoring</small></span></div>
}

export function StatusBadge({ level }: { level: RiskLevel }) {
  return <span className={`status ${level.toLowerCase().replace('_', '-')}`}><span aria-hidden="true" />{level.replace('_', ' ')}</span>
}

export function EmptyState({ icon = 'activity', title, body }: {
  icon?: 'activity' | 'alerts' | 'patients'
  title: string
  body: string
}) {
  const Icon = icon === 'alerts' ? ShieldCheck : icon === 'patients' ? Users : Activity
  return <div className="empty"><Icon /><h3>{title}</h3><p>{body}</p></div>
}

export function Loading() {
  return <div className="loading" aria-label="Loading"><i /><i /><i /></div>
}

export function ErrorState({ message }: { message: string }) {
  return <div className="error"><AlertTriangle /><div><strong>We couldn't load this view</strong><p>{message}</p></div></div>
}

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const auth = useAuth()
  const patient = user.role === 'PATIENT'
  const items = patient
    ? [['Overview', '/patient/dashboard'], ['Vitals', '/patient/vitals'], ['Alerts', '/patient/alerts'], ['Devices', '/patient/devices']]
    : [['Overview', '/doctor/dashboard'], ['Patients', '/doctor/patients'], ['Alerts', '/doctor/alerts'], ['Devices', '/doctor/devices']]

  return <div className="shell">
    <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
    <aside className={open ? 'open' : ''}>
      <button className="close" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button>
      <Brand />
      <nav aria-label={patient ? 'Patient workspace' : 'Professional workspace'}>{items.map(([label, to]) => <NavLink key={label} to={to} end={label === 'Overview'} onClick={() => setOpen(false)}><HeartPulse />{label}</NavLink>)}</nav>
      <div className="profile"><span>{user.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{user.full_name}</strong><small>{patient ? 'Patient account' : 'Healthcare professional'}</small></div></div>
      <button className="signout" onClick={() => { auth.logout(); navigate('/login', { replace: true }) }}><LogOut />Sign out</button>
    </aside>
    <main><header><div><small>SOFTWARE PROTOTYPE</small><span>Secure monitoring workspace</span></div><span className="privacy"><ShieldCheck />Synthetic data environment</span></header>{children}</main>
  </div>
}

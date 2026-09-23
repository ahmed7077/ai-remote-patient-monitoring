import {
  Activity, AlertOctagon, AlertTriangle, Bell, CheckCircle2, FlaskConical,
  HeartPulse, LayoutDashboard, LineChart, LogOut, Menu, Radio, ShieldCheck,
  UserRound, Users, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from './auth'
import type { Device, RiskLevel, Role, User, Vital } from './types'

export type StatusKind = RiskLevel | Vital['quality_status'] | Device['status'] | 'SIMULATED' | 'PROTOTYPE' | 'ACKNOWLEDGED' | 'UNAVAILABLE'

const statusMap: Record<StatusKind, { label: string; tone: string; Icon: LucideIcon }> = {
  NORMAL: { label: 'Normal', tone: 'positive', Icon: CheckCircle2 },
  VALID: { label: 'Valid', tone: 'positive', Icon: CheckCircle2 },
  ONLINE: { label: 'Online', tone: 'positive', Icon: CheckCircle2 },
  WARNING: { label: 'Monitor', tone: 'caution', Icon: AlertTriangle },
  SUSPECT: { label: 'Suspect', tone: 'caution', Icon: AlertTriangle },
  STALE: { label: 'Stale', tone: 'caution', Icon: AlertTriangle },
  HIGH_RISK: { label: 'Critical', tone: 'critical', Icon: AlertOctagon },
  INVALID: { label: 'Invalid', tone: 'critical', Icon: AlertOctagon },
  OFFLINE: { label: 'Offline', tone: 'neutral', Icon: Radio },
  SIMULATED: { label: 'Simulated', tone: 'info', Icon: FlaskConical },
  PROTOTYPE: { label: 'Prototype', tone: 'info', Icon: FlaskConical },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'neutral', Icon: CheckCircle2 },
  UNAVAILABLE: { label: 'Unavailable', tone: 'neutral', Icon: Radio },
}

export function Brand() {
  return <div className="brand"><span className="brand-mark"><Activity /></span><span>PulseBridge<small>Remote monitoring</small></span></div>
}

export function StatusBadge({ status, level, label }: { status?: StatusKind; level?: RiskLevel; label?: string }) {
  const resolved = status ?? level ?? 'UNAVAILABLE'
  const item = statusMap[resolved]
  return <span className={`status-badge ${item.tone}`}><item.Icon aria-hidden="true" />{label ?? item.label}</span>
}

export function SimulatedTag() { return <StatusBadge status="SIMULATED" /> }

export function RiskDisclosureNote() {
  return <div className="risk-disclosure"><StatusBadge status="PROTOTYPE" /><p><strong>Prototype Rule-Based Risk Assessment</strong><span>For software demonstration only. This is not a diagnosis, medical advice, or a substitute for clinician judgment.</span></p></div>
}

export function EmptyState({ icon = 'activity', title, body, action }: {
  icon?: 'activity' | 'alerts' | 'patients' | 'devices'
  title: string
  body: string
  action?: ReactNode
}) {
  const icons = { activity: Activity, alerts: ShieldCheck, patients: Users, devices: Radio }
  const Icon = icons[icon]
  return <div className="empty"><span className="empty-icon"><Icon /></span><h3>{title}</h3><p>{body}</p>{action}</div>
}

export function SkeletonBlock({ variant = 'card', count = 1 }: { variant?: 'card' | 'row' | 'chart'; count?: number }) {
  return <div className={`skeleton-group ${variant}`} aria-hidden="true">{Array.from({ length: count }, (_, index) => <span className="skeleton" key={index} />)}</div>
}

export function Loading() { return <div className="loading-shell" aria-label="Loading"><SkeletonBlock variant="card" count={4} /><SkeletonBlock variant="chart" /></div> }

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error" role="alert"><AlertTriangle /><div><strong>We couldn’t load this view</strong><p>{message}</p>{retry && <button onClick={retry}>Try again</button>}</div></div>
}

type NavItem = { label: string; to: string; Icon: LucideIcon }
const navigation: Record<Role, NavItem[]> = {
  PATIENT: [
    { label: 'Overview', to: '/patient/dashboard', Icon: LayoutDashboard },
    { label: 'Vitals', to: '/patient/vitals', Icon: HeartPulse },
    { label: 'Trends', to: '/patient/trends', Icon: LineChart },
    { label: 'Alerts', to: '/patient/alerts', Icon: Bell },
    { label: 'Devices', to: '/patient/devices', Icon: Radio },
  ],
  HEALTHCARE_PROFESSIONAL: [
    { label: 'Overview', to: '/doctor/dashboard', Icon: LayoutDashboard },
    { label: 'Patients', to: '/doctor/patients', Icon: Users },
    { label: 'Alerts', to: '/doctor/alerts', Icon: Bell },
    { label: 'Devices', to: '/doctor/devices', Icon: Radio },
  ],
}

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const auth = useAuth()

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  function closeNavigation() { setOpen(false); triggerRef.current?.focus() }
  const items = navigation[user.role]
  const patient = user.role === 'PATIENT'

  return <div className="shell">
    <button ref={triggerRef} className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu /></button>
    {open && <button className="nav-scrim" aria-label="Close navigation" onClick={closeNavigation} />}
    <aside className={open ? 'open' : ''} aria-label="Primary sidebar">
      <button ref={closeRef} className="close" onClick={closeNavigation} aria-label="Close navigation"><X /></button>
      <Brand />
      <span className="nav-label">{patient ? 'My monitoring' : 'Clinical workspace'}</span>
      <nav aria-label={patient ? 'Patient workspace' : 'Professional workspace'}>{items.map(({ label, to, Icon }) => <NavLink key={label} to={to} end={label === 'Overview'} onClick={() => setOpen(false)}><span className="active-rail" /><span className="nav-icon"><Icon aria-hidden="true" /></span><span>{label}</span></NavLink>)}</nav>
      <div className="profile"><span>{user.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{user.full_name}</strong><small><UserRound />{patient ? 'Patient' : 'Healthcare professional'}</small></div></div>
      <button className="signout" onClick={() => { auth.logout(); navigate('/login', { replace: true }) }}><LogOut />Sign out</button>
    </aside>
    <main><header className="topbar"><div><StatusBadge status="PROTOTYPE" /><span className="workspace-state"><i aria-hidden="true" />Secure monitoring workspace</span></div><div className="topbar-user"><span>{user.full_name}</span><small>{patient ? 'Patient' : 'Healthcare professional'}</small></div></header>{children}</main>
  </div>
}

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, Cpu, HeartPulse, KeyRound, LoaderCircle, Thermometer, Users, Wind } from 'lucide-react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from './api'
import { EmptyState, ErrorState, Loading, RiskDisclosureNote, SimulatedTag, SkeletonBlock, StatusBadge } from './components'
import type { Alert, DemoScenario, Device, DeviceRegistration, Patient, Session, User, Vital } from './types'

const vitalMeta = {
  HEART_RATE: { label: 'Heart rate', icon: HeartPulse },
  SPO2: { label: 'Estimated SpO₂', icon: Activity },
  TEMPERATURE: { label: 'Skin temperature', icon: Thermometer },
  RESPIRATORY_RATE: { label: 'Experimental respiratory rate', icon: Wind },
} as const

const trendMetrics = {
  heart: { label: 'Heart rate', unit: 'bpm', color: '#a65343' },
  spo2: { label: 'Estimated SpO₂', unit: '%', color: '#66724e' },
  temperature: { label: 'Skin temperature', unit: '°C', color: '#b68143' },
  respiratory: { label: 'Respiratory rate', unit: 'breaths/min', color: '#607683' },
} as const

function time(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

function PageHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div></div>
}

function usePatientProfile() {
  const user = useOutletContext<User>()
  const patients = useQuery({ queryKey: ['patients'], queryFn: api.patients })
  return { patients, patient: patients.data?.find(item => item.linked_user_id === user.id) }
}

function PatientPage({ children, emptyTitle, emptyBody }: { children: (patient: Patient) => ReactNode; emptyTitle: string; emptyBody: string }) {
  const { patients, patient } = usePatientProfile()
  if (patients.isLoading) return <Loading />
  if (patients.isError) return <ErrorState message={patients.error.message} retry={() => patients.refetch()} />
  if (!patient) return <EmptyState title={emptyTitle} body={emptyBody} />
  return children(patient)
}

function usePatientData(patientId: string) {
  const queries = useQueries({ queries: [
    { queryKey: ['sessions', patientId], queryFn: () => api.sessions(patientId) },
    { queryKey: ['risks', patientId], queryFn: () => api.risks(patientId) },
    { queryKey: ['alerts', patientId], queryFn: () => api.alerts(patientId) },
    { queryKey: ['devices', patientId], queryFn: () => api.devices(patientId) },
  ] })
  return { queries, sessions: queries[0], risks: queries[1], alerts: queries[2], devices: queries[3] }
}

function VitalCard({ vital, label, Icon }: { vital?: Vital; label: string; Icon: typeof Activity }) {
  const quality = vital?.quality_status ?? 'UNAVAILABLE'
  return <article className={`vital quality-${quality.toLowerCase()}`}><div className="vital-top"><span className="vital-icon"><Icon /></span><span className="quality-label"><i />{quality === 'VALID' ? 'Available' : quality.toLowerCase()}</span></div><p>{label}</p>{vital ? <strong className="vital-value">{vital.value} <small>{vital.unit}</small></strong> : <><strong className="vital-value">—</strong><div className="vital-meta"><span>Unavailable</span></div></>}</article>
}

function VitalsGrid({ sessions }: { sessions: Session[] }) {
  const latest = sessions[0]
  const latestMap = new Map(latest?.measurements.map(vital => [vital.vital_type, vital]))
  return <section className="vital-grid" aria-label="Latest vital readings">{Object.entries(vitalMeta).map(([key, meta]) => <VitalCard key={key} vital={latestMap.get(key as Vital['vital_type'])} label={meta.label} Icon={meta.icon} />)}</section>
}

function Trend({ sessions }: { sessions: Session[] }) {
  const reducedMotion = useReducedMotion()
  const [metric, setMetric] = useState<keyof typeof trendMetrics>('heart')
  const selected = trendMetrics[metric]
  const data = [...sessions].reverse().map(session => {
    const find = (type: Vital['vital_type']) => session.measurements.find(vital => vital.vital_type === type)?.value
    return {
      name: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(session.recorded_at)),
      heart: find('HEART_RATE'),
      spo2: find('SPO2'),
      temperature: find('TEMPERATURE'),
      respiratory: find('RESPIRATORY_RATE'),
    }
  })
  const sources = new Set(sessions.map(session => session.source))
  const sourceLabel = sources.size > 1 ? 'Mixed simulated and ESP32 data' : sources.has('PHYSICAL_DEVICE') ? 'Physical ESP32 data' : 'Simulated data'
  const motion = { isAnimationActive: !reducedMotion, animationDuration: 850, animationEasing: 'ease-out' as const }
  return <div className="chart" aria-label="Recent vital trend chart"><div className="trend-tabs" role="tablist" aria-label="Trend legend and metric selector">{Object.entries(trendMetrics).map(([key, item]) => <button key={key} role="tab" aria-selected={metric === key} onClick={() => setMetric(key as keyof typeof trendMetrics)}><i style={{ background: item.color }} /><span>{item.label}<small>{item.unit}</small></span></button>)}</div><div className="chart-stage"><ResponsiveContainer width="100%" height={340}><AreaChart data={data} margin={{ top: 8, right: 12, bottom: 12, left: -12 }}><defs><linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={selected.color} stopOpacity={.22}/><stop offset="100%" stopColor={selected.color} stopOpacity={0}/></linearGradient></defs><Legend verticalAlign="top" align="right" height={42} iconType="plainline" iconSize={18} wrapperStyle={{fontFamily:'Inter, sans-serif',fontSize:11,color:'#514a40'}} /><CartesianGrid stroke="#d7cebf" strokeDasharray="2 5" vertical={false} /><XAxis dataKey="name" interval="preserveStartEnd" minTickGap={36} axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#736b5f'}} dy={8} /><YAxis unit={` ${selected.unit}`} width={66} axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#736b5f'}} /><Tooltip cursor={{stroke:'#a89d8d', strokeDasharray:'3 4'}} contentStyle={{border:'1px solid #cabfad',borderRadius:10,fontFamily:'JetBrains Mono',boxShadow:'0 10px 30px rgba(61,48,35,.14)',background:'#fffaf1'}} labelStyle={{color:'#736b5f',marginBottom:6}} /><Area {...motion} connectNulls type="monotone" dataKey={metric} name={`${selected.label} (${selected.unit})`} stroke={selected.color} strokeWidth={2.6} fill="url(#metricFill)" dot={{r:2.5, fill:'#fffaf1', strokeWidth:2}} activeDot={{r:5, strokeWidth:2, fill:'#fffaf1'}} /></AreaChart></ResponsiveContainer></div><div className="chart-origin"><span className="source-note">{sourceLabel}</span></div></div>
}

function AlertsList({ patientId, alerts, professional = false }: { patientId: string; alerts: Alert[]; professional?: boolean }) {
  const client = useQueryClient()
  const acknowledgement = useMutation({ mutationFn: api.acknowledge, onSuccess: () => client.invalidateQueries({ queryKey: ['alerts', patientId] }) })
  if (!alerts.length) return <EmptyState icon="alerts" title="No alerts" body="There are no alerts generated from persisted readings." />
  return <div>{alerts.map(alert => <div className={`alert-row ${alert.acknowledged ? 'ack' : ''}`} key={alert.id}><span className={`alert-marker ${alert.severity.toLowerCase()}`} aria-hidden="true" /><div><strong>{alert.message}</strong><small>{alert.acknowledged ? 'Reviewed' : 'Needs review'} · Persisted reading</small></div>{professional && !alert.acknowledged && <button disabled={acknowledgement.isPending} onClick={() => acknowledgement.mutate(alert.id)}>Acknowledge</button>}</div>)}</div>
}

function DeviceList({ devices }: { devices: Device[] }) {
  if (!devices.length) return <EmptyState title="No monitoring device linked" body="A device will appear here after a healthcare professional links it to this profile." />
  return <div className="device-list">{devices.map(device => <article className="device-row" key={device.id}><div><span className="device-kind">{device.device_type === 'SIMULATOR' ? 'Software simulator' : 'ESP32 finger-rest device'}</span><span className={`device-state ${device.status.toLowerCase()}`}><i />{device.status.toLowerCase()}</span></div><strong>{device.device_uid}</strong><p>{device.last_seen_at ? `Last successful contact ${time(device.last_seen_at)}` : 'Waiting for first successful reading'}{device.firmware_version ? ` · Firmware ${device.firmware_version}` : ''}</p></article>)}</div>
}

function DemoControls({ patientId }: { patientId: string }) {
  const client = useQueryClient()
  const simulation = useMutation({
    mutationFn: (scenario: DemoScenario) => api.simulate(patientId, scenario),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sessions', patientId] }),
        client.invalidateQueries({ queryKey: ['risks', patientId] }),
        client.invalidateQueries({ queryKey: ['alerts', patientId] }),
        client.invalidateQueries({ queryKey: ['devices', patientId] }),
      ])
    },
  })
  return <section className="panel demo-panel"><div><span className="eyebrow">REVIEWER DEMO</span><h2>Generate simulated reading</h2><p>Create one clearly labelled synthetic session using the existing quality, risk, and alert pipeline.</p></div><div className="demo-actions"><button aria-label="Normal" disabled={simulation.isPending} onClick={() => simulation.mutate('normal')}><CheckCircle2 /><span><strong>Normal</strong><small>Stable range</small></span></button><button aria-label="Warning" disabled={simulation.isPending} onClick={() => simulation.mutate('warning')}><AlertTriangle /><span><strong>Warning</strong><small>Needs review</small></span></button><button aria-label="High risk" className="danger" disabled={simulation.isPending} onClick={() => simulation.mutate('high-risk')}><AlertOctagon /><span><strong>High risk</strong><small>Urgent signal</small></span></button></div>{simulation.isPending && <small className="progress-note" role="status"><LoaderCircle />Generating synthetic reading…</small>}{simulation.isSuccess && <small className="success" role="status">Synthetic reading generated. The monitoring view has been refreshed.</small>}{simulation.isError && <div className="form-error" role="alert">{simulation.error.message}</div>}</section>
}

function PatientDetail({ patient, professional = false }: { patient: Patient; professional?: boolean }) {
  const data = usePatientData(patient.id)
  if (data.queries.some(query => query.isLoading)) return <Loading />
  const failed = data.queries.find(query => query.error)
  if (failed) return <ErrorState message={failed.error?.message ?? 'Unable to load patient information.'} />
  const sessions = data.sessions.data ?? []
  const risk = data.risks.data?.[0]
  return <><PageHeading eyebrow={professional ? patient.patient_code : 'HOW AM I DOING'} title={professional ? patient.display_name : `Monitoring overview for ${patient.display_name}`} body={sessions[0] ? 'Your latest readings and monitoring summary are ready.' : 'This workspace is ready when the first monitoring reading arrives.'} />{professional && <DemoControls patientId={patient.id} />}<VitalsGrid sessions={sessions} /><section className="two-col"><div className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">DECISION SUPPORT</span><h2>Prototype Rule-Based Risk Assessment</h2></div>{risk && <StatusBadge level={risk.risk_level} />}</div>{risk ? <div className="risk-copy"><p>{risk.explanation}</p></div> : <EmptyState title="No assessment available" body="An assessment will appear after valid measurements are received." />}<RiskDisclosureNote /></div><div className="panel"><div className="section-title"><div><span className="eyebrow">CONNECTED SOURCE</span><h2>Monitoring status</h2></div></div><DeviceList devices={data.devices.data ?? []} /></div></section><section className="panel"><div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Recent alerts</h2></div><Link to={professional ? '/doctor/alerts' : '/patient/alerts'}>View all →</Link></div><AlertsList patientId={patient.id} alerts={(data.alerts.data ?? []).slice(0, 3)} professional={professional} /></section></>
}

export function PatientDashboard() {
  const { patients, patient } = usePatientProfile()
  if (patients.isLoading) return <Loading />
  if (patients.isError) return <div className="workspace"><ErrorState message={patients.error.message} retry={() => patients.refetch()} /></div>
  if (!patient) return <div className="workspace"><PageHeading eyebrow="MONITORING OVERVIEW" title="Welcome to PulseBridge" body="Your monitoring workspace is ready for a healthcare professional to connect." /><EmptyState title="No patient profile linked" body="A healthcare professional must create and link your monitoring profile before readings can appear." /></div>
  return <div className="workspace"><PatientDetail patient={patient} /></div>
}

export function PatientVitals() {
  return <div className="workspace"><PageHeading eyebrow="MEASUREMENT HISTORY" title="Vitals" body="Review measurements received from your linked monitoring source." /><PatientPage emptyTitle="No measurements yet" emptyBody="Readings will appear after a monitoring profile and device are linked and measurements are received.">{patient => <PatientVitalsContent patient={patient} />}</PatientPage></div>
}

function PatientVitalsContent({ patient }: { patient: Patient }) {
  const sessions = useQuery({ queryKey: ['sessions', patient.id], queryFn: () => api.sessions(patient.id) })
  if (sessions.isLoading) return <><SkeletonBlock variant="card" count={4} /><SkeletonBlock variant="row" count={4} /></>
  if (sessions.isError) return <ErrorState message={sessions.error.message} retry={() => sessions.refetch()} />
  const history = sessions.data ?? []
  return <><VitalsGrid sessions={history} /><section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">PERSISTED MEASUREMENTS</span><h2>Measurement history</h2></div></div><HistoryTable sessions={history} /></section></>
}

function HistoryTable({ sessions }: { sessions: Session[] }) {
  const rows = sessions.flatMap(session => session.measurements.map(vital => ({ session, vital })))
  if (!rows.length) return <EmptyState title="No measurements yet" body="Persisted readings will appear here after a linked monitoring source sends data." />
  return <div className="table-wrap"><table className="history-table"><thead><tr><th>Parameter</th><th>Value</th><th>Quality</th><th>Recorded</th><th>Origin</th></tr></thead><tbody>{rows.map(({ session, vital }) => <tr key={`${session.id}-${vital.vital_type}`}><td data-label="Parameter">{vitalMeta[vital.vital_type as keyof typeof vitalMeta]?.label ?? `${vital.vital_type.replaceAll('_', ' ')} (legacy)`}</td><td className="mono" data-label="Value">{vital.value} {vital.unit}</td><td data-label="Quality"><StatusBadge status={vital.quality_status} /></td><td className="mono" data-label="Recorded">{time(session.recorded_at)}</td><td data-label="Origin">{session.source === 'SIMULATED' ? <SimulatedTag /> : <span className="physical-source">ESP32</span>}</td></tr>)}</tbody></table></div>
}

export function PatientTrends() {
  return <div className="workspace"><PageHeading eyebrow="MEASUREMENT PATTERNS" title="Trends" body="Explore changes across persisted measurements. Trends appear only when enough real sessions exist." /><PatientPage emptyTitle="Trend unavailable" emptyBody="A linked monitoring profile and at least two measurement sessions are needed before a trend can be shown.">{patient => <PatientTrendsContent patient={patient} />}</PatientPage></div>
}

function PatientTrendsContent({ patient }: { patient: Patient }) {
  const sessions = useQuery({ queryKey: ['sessions', patient.id], queryFn: () => api.sessions(patient.id) })
  if (sessions.isLoading) return <SkeletonBlock variant="chart" />
  if (sessions.isError) return <ErrorState message={sessions.error.message} retry={() => sessions.refetch()} />
  const history = sessions.data ?? []
  return <section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">RECENT SESSIONS</span><h2>Vital trend</h2></div></div>{history.length > 1 ? <Trend sessions={history} /> : <EmptyState title="Not enough data yet for a trend" body="At least two persisted sessions are required. PulseBridge never interpolates or invents missing measurements." />}</section>
}

export function PatientAlerts() {
  return <div className="workspace"><PageHeading eyebrow="MONITORING NOTIFICATIONS" title="Alerts" body="View alerts generated from your persisted measurements." /><PatientPage emptyTitle="No alerts" emptyBody="Alerts will appear here after a monitoring profile is linked and qualifying measurements are received.">{patient => <PatientAlertsContent patient={patient} />}</PatientPage></div>
}

function PatientAlertsContent({ patient }: { patient: Patient }) {
  const [filter, setFilter] = useState<'ALL' | 'UNRESOLVED' | 'HIGH_RISK' | 'WARNING'>('ALL')
  const alerts = useQuery({ queryKey: ['alerts', patient.id], queryFn: () => api.alerts(patient.id) })
  if (alerts.isLoading) return <SkeletonBlock variant="row" count={4} />
  if (alerts.isError) return <ErrorState message={alerts.error.message} retry={() => alerts.refetch()} />
  const filtered = (alerts.data ?? []).filter(alert => filter === 'ALL' || (filter === 'UNRESOLVED' ? !alert.acknowledged : alert.severity === filter))
  return <section className="panel"><div className="filter-row"><span>{filtered.length} alert{filtered.length === 1 ? '' : 's'}</span><label>Filter<select className="filter-select" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="ALL">All alerts</option><option value="UNRESOLVED">Unresolved</option><option value="HIGH_RISK">Critical</option><option value="WARNING">Monitor</option></select></label></div><AlertsList patientId={patient.id} alerts={filtered} /></section>
}

export function PatientDevices() {
  return <div className="workspace"><PageHeading eyebrow="CONNECTED MONITORING" title="Devices" body="Review the status and last contact time of your linked monitoring source." /><PatientPage emptyTitle="No monitoring device linked" emptyBody="A device will appear after a healthcare professional creates and links your monitoring profile and device.">{patient => <PatientDevicesContent patient={patient} />}</PatientPage></div>
}

function PatientDevicesContent({ patient }: { patient: Patient }) {
  const devices = useQuery({ queryKey: ['devices', patient.id], queryFn: () => api.devices(patient.id) })
  if (devices.isLoading) return <SkeletonBlock variant="row" count={3} />
  if (devices.isError) return <ErrorState message={devices.error.message} retry={() => devices.refetch()} />
  return <section className="panel"><DeviceList devices={devices.data ?? []} /></section>
}

function useAssignedPatients() { return useQuery({ queryKey: ['patients'], queryFn: api.patients }) }

export function DoctorDashboard() {
  const patients = useAssignedPatients()
  const assigned = patients.data ?? []
  const alertQueries = useQueries({ queries: assigned.map(patient => ({ queryKey: ['alerts', patient.id], queryFn: () => api.alerts(patient.id) })) })
  const deviceQueries = useQueries({ queries: assigned.map(patient => ({ queryKey: ['devices', patient.id], queryFn: () => api.devices(patient.id) })) })
  const sessionQueries = useQueries({ queries: assigned.map(patient => ({ queryKey: ['sessions', patient.id], queryFn: () => api.sessions(patient.id) })) })
  if (patients.isLoading) return <Loading />
  if (patients.isError) return <div className="workspace"><ErrorState message={patients.error.message} retry={() => patients.refetch()} /></div>
  if ([...alertQueries, ...deviceQueries, ...sessionQueries].some(query => query.isLoading)) return <Loading />
  const queue = assigned.map((patient, index) => {
    const alerts = alertQueries[index].data ?? []
    const devices = deviceQueries[index].data ?? []
    const sessions = sessionQueries[index].data ?? []
    const active = alerts.filter(alert => !alert.acknowledged)
    const severity = active.some(alert => alert.severity === 'HIGH_RISK') ? 2 : active.some(alert => alert.severity === 'WARNING') ? 1 : 0
    return { patient, active, devices, latest: sessions[0], severity }
  }).sort((left, right) => right.severity - left.severity || (right.active[0]?.created_at ?? '').localeCompare(left.active[0]?.created_at ?? ''))
  const activeAlerts = queue.reduce((total, row) => total + row.active.length, 0)
  const devicesNeedingAttention = queue.reduce((total, row) => total + row.devices.filter(device => device.status !== 'ONLINE').length, 0)
  return <div className="workspace"><PageHeading eyebrow="TRIAGE OVERVIEW" title="Attention queue" body="Assigned patients ordered by real unresolved alert signals. No inferred risk ranking is used." /><div className="summary"><article><Users /><strong>{assigned.length}</strong><span>Assigned patients</span></article><article><AlertTriangle /><strong>{activeAlerts}</strong><span>Unresolved alerts</span></article><article><Activity /><strong>{devicesNeedingAttention}</strong><span>Devices needing attention</span></article></div><section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">REAL SIGNALS ONLY</span><h2>Review priority</h2></div><Link to="/doctor/patients">Manage patients →</Link></div>{queue.length ? <div className="triage-list">{queue.map(row => <Link key={row.patient.id} to={`/doctor/patients/${row.patient.id}`}><span className="avatar">{row.patient.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{row.patient.display_name}</strong><small>{row.patient.patient_code} · {row.latest ? 'Readings available' : 'No measurements yet'}</small></span><StatusBadge status={row.severity === 2 ? 'HIGH_RISK' : row.severity === 1 ? 'WARNING' : 'NORMAL'} label={row.active.length ? `${row.active.length} unresolved` : 'Clear'} /></Link>)}</div> : <EmptyState icon="patients" title="No patients assigned" body="Create and link a patient monitoring profile to begin." />}</section></div>
}

function PatientLinks({ patients }: { patients: Patient[] }) {
  if (!patients.length) return <EmptyState icon="patients" title="No patients assigned" body="Create and link a patient monitoring profile to begin." />
  return <div className="patient-list">{patients.map(patient => <Link key={patient.id} to={`/doctor/patients/${patient.id}`}><span className="avatar">{patient.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{patient.display_name}</strong><small>{patient.patient_code}</small></span><span className="open">Open record →</span></Link>)}</div>
}

export function DoctorPatients() {
  const patients = useAssignedPatients()
  const client = useQueryClient()
  const create = useMutation({ mutationFn: api.createPatient, onSuccess: () => client.invalidateQueries({ queryKey: ['patients'] }) })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    create.mutate({ patient_code: String(data.get('patient_code')).toUpperCase(), display_name: String(data.get('display_name')), linked_user_email: String(data.get('linked_user_email')) || undefined }, { onSuccess: () => form.reset() })
  }
  return <div className="workspace"><PageHeading eyebrow="CARE RELATIONSHIPS" title="Patients" body="Create a monitoring profile and optionally link it to an existing patient account." /><section className="panel"><div className="section-title"><div><span className="eyebrow">NEW PROFILE</span><h2>Create and assign patient</h2></div></div><form className="patient-form" onSubmit={submit}><label>Patient code<input name="patient_code" required pattern="[A-Za-z0-9-]{3,40}" placeholder="PAT-001" /></label><label>Display name<input name="display_name" required minLength={2} placeholder="Patient name" /></label><label>Patient account email <small>(optional)</small><input name="linked_user_email" type="email" placeholder="patient@example.com" /></label><button className="primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create patient profile'}</button></form>{create.isError && <div className="form-error" role="alert">{create.error.message}</div>}{create.isSuccess && <div className="success" role="status">Patient profile created and assigned to you.</div>}</section><section className="panel"><div className="section-title"><div><span className="eyebrow">ASSIGNED TO YOU</span><h2>Monitoring list</h2></div></div>{patients.isLoading ? <Loading /> : patients.isError ? <ErrorState message={patients.error.message} /> : <PatientLinks patients={patients.data ?? []} />}</section></div>
}

export function DoctorPatientDetail() {
  const { patientId } = useParams()
  const patients = useAssignedPatients()
  if (patients.isLoading) return <Loading />
  if (patients.isError) return <ErrorState message={patients.error.message} />
  const patient = patients.data?.find(item => item.id === patientId)
  if (!patient) return <div className="workspace"><EmptyState icon="patients" title="Patient not available" body="This record is not assigned to your account or no longer exists." /></div>
  return <div className="workspace"><Link className="back" to="/doctor/patients">← All patients</Link><PatientDetail patient={patient} professional /></div>
}

function DeviceRegistrationPanel({ patients }: { patients: Patient[] }) {
  const client = useQueryClient()
  const [registration, setRegistration] = useState<DeviceRegistration | null>(null)
  const register = useMutation({
    mutationFn: api.registerDevice,
    onSuccess: async device => {
      setRegistration(device)
      await client.invalidateQueries({ queryKey: ['devices', device.patient_id] })
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setRegistration(null)
    register.mutate({
      patient_id: String(data.get('patient_id')),
      device_uid: String(data.get('device_uid')).trim(),
      device_type: 'ESP32',
      firmware_version: String(data.get('firmware_version')).trim() || undefined,
    }, { onSuccess: () => form.reset() })
  }
  return <section className="panel device-registration"><div className="section-title"><div><span className="eyebrow">PHYSICAL DEVICE PROVISIONING</span><h2><Cpu /> Register an ESP32</h2></div></div><p>Link a finger-rest device to an assigned patient. The ingestion credential is revealed once after registration.</p><form className="device-form" onSubmit={submit}><label>Patient<select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.display_name} · {patient.patient_code}</option>)}</select></label><label>Device UID<input name="device_uid" required minLength={3} maxLength={80} placeholder="PB-ESP32-001" /></label><label>Firmware <small>(optional)</small><input name="firmware_version" maxLength={40} placeholder="0.1.0" /></label><button className="primary" disabled={register.isPending || !patients.length}>{register.isPending ? 'Registering…' : 'Register device'}</button></form>{register.isError && <div className="form-error" role="alert">{register.error.message}</div>}{registration?.device_credential && <div className="credential-reveal" role="status"><KeyRound /><div><strong>Copy this credential now</strong><p>It will not appear again. Store it only in the device's private configuration.</p><code>{registration.device_credential}</code></div></div>}</section>
}

function AggregatePage({ kind }: { kind: 'alerts' | 'devices' }) {
  const patients = useAssignedPatients()
  const queries = useQueries({ queries: (patients.data ?? []).map(patient => ({ queryKey: [kind, patient.id], queryFn: () => kind === 'alerts' ? api.alerts(patient.id) : api.devices(patient.id) })) })
  if (patients.isLoading || queries.some(query => query.isLoading)) return <Loading />
  if (patients.isError) return <ErrorState message={patients.error.message} />
  const failed = queries.find(query => query.error)
  if (failed) return <ErrorState message={failed.error?.message ?? `Unable to load ${kind}.`} />
  const rows = (patients.data ?? []).map((patient, index) => ({ patient, data: queries[index]?.data ?? [] }))
  return <>{rows.length ? rows.map(row => <section className="panel" key={row.patient.id}><div className="section-title"><div><span className="eyebrow">{row.patient.patient_code}</span><h2>{row.patient.display_name}</h2></div><Link to={`/doctor/patients/${row.patient.id}`}>Open record →</Link></div>{kind === 'alerts' ? <AlertsList patientId={row.patient.id} alerts={row.data as Alert[]} professional /> : <DeviceList devices={row.data as Device[]} />}</section>) : <EmptyState icon="patients" title="No patients assigned" body={`Assign a patient before reviewing ${kind}.`} />}</>
}

export function DoctorAlerts() { return <div className="workspace"><PageHeading eyebrow="ATTENTION QUEUE" title="Alerts" body="Review and acknowledge alerts for patients assigned to you." /><AggregatePage kind="alerts" /></div> }
export function DoctorDevices() {
  const patients = useAssignedPatients()
  return <div className="workspace"><PageHeading eyebrow="MONITORING SOURCES" title="Devices" body="Register physical monitoring devices and review their most recent contact." />{patients.isLoading ? <Loading /> : patients.isError ? <ErrorState message={patients.error.message} retry={() => patients.refetch()} /> : <DeviceRegistrationPanel patients={patients.data ?? []} />}<AggregatePage kind="devices" /></div>
}

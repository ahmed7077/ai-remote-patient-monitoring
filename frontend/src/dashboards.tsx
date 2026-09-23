import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Activity, AlertTriangle, HeartPulse, Stethoscope, Thermometer, Users } from 'lucide-react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from './api'
import { EmptyState, ErrorState, Loading, RiskDisclosureNote, SimulatedTag, SkeletonBlock, StatusBadge } from './components'
import type { Alert, DemoScenario, Device, Patient, Session, User, Vital } from './types'

const vitalMeta = {
  HEART_RATE: { label: 'Heart rate', icon: HeartPulse },
  SPO2: { label: 'Oxygen saturation', icon: Activity },
  SYSTOLIC_BP: { label: 'Blood pressure', icon: Stethoscope },
  TEMPERATURE: { label: 'Temperature', icon: Thermometer },
} as const

function time(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
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

function VitalCard({ vital, diastolic, label, Icon, recordedAt, simulated }: { vital?: Vital; diastolic?: Vital; label: string; Icon: typeof Activity; recordedAt?: string; simulated?: boolean }) {
  return <article className="vital"><div className="vital-top"><span className="vital-icon"><Icon /></span><StatusBadge status={vital?.quality_status ?? 'UNAVAILABLE'} /></div><p>{label}</p>{vital ? <><strong className="vital-value">{vital.value}{diastolic && ` / ${diastolic.value}`} <small>{vital.unit}</small></strong><div className="vital-meta"><span>{recordedAt ? `As of ${time(recordedAt)}` : 'Latest reading'}</span>{simulated && <SimulatedTag />}</div></> : <><strong className="vital-value">—</strong><div className="vital-meta"><span>No reading received</span></div></>}</article>
}

function VitalsGrid({ sessions }: { sessions: Session[] }) {
  const latest = sessions[0]
  const latestMap = new Map(latest?.measurements.map(vital => [vital.vital_type, vital]))
  return <section className="vital-grid" aria-label="Latest vital readings">{Object.entries(vitalMeta).map(([key, meta]) => <VitalCard key={key} vital={key === 'SYSTOLIC_BP' ? latestMap.get('SYSTOLIC_BP') : latestMap.get(key as Vital['vital_type'])} diastolic={key === 'SYSTOLIC_BP' ? latestMap.get('DIASTOLIC_BP') : undefined} label={meta.label} Icon={meta.icon} recordedAt={latest?.recorded_at} simulated={latest?.source === 'SIMULATED'} />)}</section>
}

function Trend({ sessions }: { sessions: Session[] }) {
  const data = [...sessions].reverse().map(session => {
    const find = (type: Vital['vital_type']) => session.measurements.find(vital => vital.vital_type === type)?.value
    return { name: new Date(session.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), heart: find('HEART_RATE'), spo2: find('SPO2'), temperature: find('TEMPERATURE') }
  })
  return <div className="chart" aria-label="Recent vital trend chart"><ResponsiveContainer width="100%" height={300}><LineChart data={data}><CartesianGrid stroke="#daddd8" vertical={false} /><XAxis dataKey="name" stroke="#66716e" tick={{fontSize:10}} /><YAxis stroke="#66716e" tick={{fontSize:10}} /><Tooltip contentStyle={{borderColor:'#bdc5c1',borderRadius:8,fontFamily:'JetBrains Mono'}} labelStyle={{color:'#66716e'}} /><Line isAnimationActive={false} type="monotone" dataKey="heart" name="Heart rate · bpm" stroke="#a33e3b" strokeWidth={2} /><Line isAnimationActive={false} type="monotone" dataKey="spo2" name="SpO₂ · %" stroke="#155f68" strokeWidth={2} /><Line isAnimationActive={false} type="monotone" dataKey="temperature" name="Temperature · °C" stroke="#555b8d" strokeWidth={2} /></LineChart></ResponsiveContainer><div className="chart-origin"><SimulatedTag />Synthetic persisted measurements</div></div>
}

function AlertsList({ patientId, alerts, professional = false }: { patientId: string; alerts: Alert[]; professional?: boolean }) {
  const client = useQueryClient()
  const acknowledgement = useMutation({ mutationFn: api.acknowledge, onSuccess: () => client.invalidateQueries({ queryKey: ['alerts', patientId] }) })
  if (!alerts.length) return <EmptyState icon="alerts" title="No alerts" body="There are no alerts generated from persisted readings." />
  return <div>{alerts.map(alert => <div className={`alert-row ${alert.acknowledged ? 'ack' : ''}`} key={alert.id}><StatusBadge level={alert.severity} /><div><strong>{alert.message}</strong><small>{time(alert.created_at)} · {alert.acknowledged ? 'Acknowledged' : 'Needs review'} · Simulated source</small></div>{professional && !alert.acknowledged && <button disabled={acknowledgement.isPending} onClick={() => acknowledgement.mutate(alert.id)}>Acknowledge</button>}</div>)}</div>
}

function DeviceList({ devices }: { devices: Device[] }) {
  if (!devices.length) return <EmptyState title="No monitoring device linked" body="A device will appear here after a healthcare professional links it to this profile." />
  return <div className="device-list">{devices.map(device => <article className="device-row" key={device.id}><div>{device.device_type === 'SIMULATOR' ? <SimulatedTag /> : <StatusBadge status={device.status} />}<StatusBadge status={device.status} /></div><strong>{device.device_uid}</strong><p>{device.device_type === 'SIMULATOR' ? 'Software simulator' : 'Physical device'} · {device.status.toLowerCase()}</p><small>{device.last_seen_at ? `Last seen ${time(device.last_seen_at)}` : 'No measurements received'}{device.firmware_version ? ` · Firmware ${device.firmware_version}` : ''}</small></article>)}</div>
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
  return <section className="panel demo-panel"><div><span className="eyebrow">REVIEWER DEMO</span><h2>Generate simulated reading</h2><p>Create one clearly labelled synthetic session using the existing quality, risk, and alert pipeline.</p></div><div className="demo-actions"><button disabled={simulation.isPending} onClick={() => simulation.mutate('normal')}>Normal</button><button disabled={simulation.isPending} onClick={() => simulation.mutate('warning')}>Warning</button><button className="danger" disabled={simulation.isPending} onClick={() => simulation.mutate('high-risk')}>High risk</button></div>{simulation.isPending && <small role="status">Generating synthetic reading…</small>}{simulation.isSuccess && <small className="success" role="status">Synthetic reading generated. The monitoring view has been refreshed.</small>}{simulation.isError && <div className="form-error" role="alert">{simulation.error.message}</div>}</section>
}

function PatientDetail({ patient, professional = false }: { patient: Patient; professional?: boolean }) {
  const data = usePatientData(patient.id)
  if (data.queries.some(query => query.isLoading)) return <Loading />
  const failed = data.queries.find(query => query.error)
  if (failed) return <ErrorState message={failed.error?.message ?? 'Unable to load patient information.'} />
  const sessions = data.sessions.data ?? []
  const risk = data.risks.data?.[0]
  return <><PageHeading eyebrow={professional ? patient.patient_code : 'HOW AM I DOING'} title={professional ? patient.display_name : `Monitoring overview for ${patient.display_name}`} body={sessions[0] ? `Latest simulated synchronization ${time(sessions[0].recorded_at)}` : 'This workspace is ready when the first simulated reading arrives.'} />{professional && <DemoControls patientId={patient.id} />}<VitalsGrid sessions={sessions} /><section className="two-col"><div className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">DECISION SUPPORT</span><h2>Prototype Rule-Based Risk Assessment</h2></div>{risk && <StatusBadge level={risk.risk_level} />}</div>{risk ? <div className="risk-copy"><p>{risk.explanation}</p><small>Assessed {time(risk.created_at)} from persisted simulated measurements.</small></div> : <EmptyState title="No assessment available" body="An assessment will appear after valid simulated measurements are received." />}<RiskDisclosureNote /></div><div className="panel"><div className="section-title"><div><span className="eyebrow">CONNECTED SOURCE</span><h2>Monitoring status</h2></div></div><DeviceList devices={data.devices.data ?? []} /></div></section><section className="panel"><div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Recent alerts</h2></div><Link to={professional ? '/doctor/alerts' : '/patient/alerts'}>View all →</Link></div><AlertsList patientId={patient.id} alerts={(data.alerts.data ?? []).slice(0, 3)} professional={professional} /></section></>
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
  return <><VitalsGrid sessions={history} /><section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">PERSISTED MEASUREMENTS</span><h2>Measurement history</h2></div>{history.length > 0 && <SimulatedTag />}</div><HistoryTable sessions={history} /></section></>
}

function HistoryTable({ sessions }: { sessions: Session[] }) {
  const rows = sessions.flatMap(session => session.measurements.map(vital => ({ session, vital })))
  if (!rows.length) return <EmptyState title="No measurements yet" body="Persisted readings will appear here after a linked monitoring source sends data." />
  return <div className="table-wrap"><table className="history-table"><thead><tr><th>Parameter</th><th>Value</th><th>Quality</th><th>Recorded</th><th>Origin</th></tr></thead><tbody>{rows.map(({ session, vital }) => <tr key={`${session.id}-${vital.vital_type}`}><td data-label="Parameter">{vitalMeta[vital.vital_type as keyof typeof vitalMeta]?.label ?? vital.vital_type.replaceAll('_', ' ')}</td><td className="mono" data-label="Value">{vital.value} {vital.unit}</td><td data-label="Quality"><StatusBadge status={vital.quality_status} /></td><td className="mono" data-label="Recorded">{time(session.recorded_at)}</td><td data-label="Origin">{session.source === 'SIMULATED' ? <SimulatedTag /> : session.source}</td></tr>)}</tbody></table></div>
}

export function PatientTrends() {
  return <div className="workspace"><PageHeading eyebrow="MEASUREMENT PATTERNS" title="Trends" body="Explore changes across persisted measurements. Trends appear only when enough real sessions exist." /><PatientPage emptyTitle="Trend unavailable" emptyBody="A linked monitoring profile and at least two measurement sessions are needed before a trend can be shown.">{patient => <PatientTrendsContent patient={patient} />}</PatientPage></div>
}

function PatientTrendsContent({ patient }: { patient: Patient }) {
  const sessions = useQuery({ queryKey: ['sessions', patient.id], queryFn: () => api.sessions(patient.id) })
  if (sessions.isLoading) return <SkeletonBlock variant="chart" />
  if (sessions.isError) return <ErrorState message={sessions.error.message} retry={() => sessions.refetch()} />
  const history = sessions.data ?? []
  return <section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">RECENT SESSIONS</span><h2>Vital trend</h2></div>{history.length > 0 && <SimulatedTag />}</div>{history.length > 1 ? <Trend sessions={history} /> : <EmptyState title="Not enough data yet for a trend" body="At least two persisted sessions are required. PulseBridge never interpolates or invents missing measurements." />}</section>
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
  return <div className="workspace"><PageHeading eyebrow="TRIAGE OVERVIEW" title="Attention queue" body="Assigned patients ordered by real unresolved alert signals. No inferred risk ranking is used." /><div className="summary"><article><Users /><strong>{assigned.length}</strong><span>Assigned patients</span></article><article><AlertTriangle /><strong>{activeAlerts}</strong><span>Unresolved alerts</span></article><article><Activity /><strong>{devicesNeedingAttention}</strong><span>Devices needing attention</span></article></div><section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">REAL SIGNALS ONLY</span><h2>Review priority</h2></div><Link to="/doctor/patients">Manage patients →</Link></div>{queue.length ? <div className="triage-list">{queue.map(row => <Link key={row.patient.id} to={`/doctor/patients/${row.patient.id}`}><span className="avatar">{row.patient.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{row.patient.display_name}</strong><small>{row.patient.patient_code} · {row.latest ? `Latest ${time(row.latest.recorded_at)}` : 'No measurements yet'}</small></span><StatusBadge status={row.severity === 2 ? 'HIGH_RISK' : row.severity === 1 ? 'WARNING' : 'NORMAL'} label={row.active.length ? `${row.active.length} unresolved` : 'No active alerts'} /></Link>)}</div> : <EmptyState icon="patients" title="No patients assigned" body="Create and link a patient monitoring profile to begin." />}</section></div>
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
export function DoctorDevices() { return <div className="workspace"><PageHeading eyebrow="MONITORING SOURCES" title="Devices" body="Review linked device status for patients assigned to you." /><AggregatePage kind="devices" /></div> }

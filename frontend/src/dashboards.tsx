import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Activity, AlertOctagon, AlertTriangle, BrainCircuit, CheckCircle2, Cpu, Database, HeartPulse, KeyRound, LoaderCircle, Play, Thermometer, Users, Wind } from 'lucide-react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from './api'
import { ActivityTimeline, ClinicianCare, FollowUpQueue, SummaryContent } from './care'
import { EmptyState, ErrorState, Loading, RiskDisclosureNote, SimulatedTag, SkeletonBlock, StatusBadge } from './components'
import type { Alert, DemoScenario, Device, DeviceRegistration, Patient, Session, User, Vital } from './types'

const vitalMeta = {
  HEART_RATE: { label: 'Heart rate', icon: HeartPulse },
  SPO2: { label: 'Estimated SpO₂', icon: Activity },
  TEMPERATURE: { label: 'Skin temperature', icon: Thermometer },
  RESPIRATORY_RATE: { label: 'Experimental respiratory rate', icon: Wind },
} as const

const trendMetrics = {
  heart: { label: 'Heart rate', unit: 'bpm', color: '#087557' },
  spo2: { label: 'Estimated SpO₂', unit: '%', color: '#286789' },
  temperature: { label: 'Skin temperature', unit: '°C', color: '#94632d' },
  respiratory: { label: 'Respiratory rate', unit: 'breaths/min', color: '#466d69' },
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

function VitalCard({ vital, label, Icon, children }: { vital?: Vital; label: string; Icon: typeof Activity; children?: ReactNode }) {
  const quality = vital?.quality_status ?? 'UNAVAILABLE'
  return <article className={`vital quality-${quality.toLowerCase()}`}><div className="vital-top"><span className="vital-icon"><Icon /></span><span className="quality-label"><i />{quality === 'VALID' ? 'Available' : quality.toLowerCase()}</span></div><p>{label}</p>{vital ? <strong className="vital-value">{vital.value} <small>{vital.unit}</small></strong> : <><strong className="vital-value">—</strong><div className="vital-meta"><span>Unavailable</span></div></>}{children}</article>
}

function VitalSparkline({ sessions, type }: { sessions: Session[]; type: Vital['vital_type'] }) {
  const values = sessions.slice(0, 12).reverse().map(session => session.measurements.find(vital => vital.vital_type === type && vital.quality_status === 'VALID')?.value)
  const points = values.filter((value): value is number => value !== undefined && Number.isFinite(value))
  if (points.length < 2) return <small className="spark-note">Not enough valid readings for a trend</small>
  const min = Math.min(...points), max = Math.max(...points)
  let path = '', connected = false
  values.forEach((value, index) => {
    if (value === undefined || !Number.isFinite(value)) { connected = false; return }
    const x = 2 + index * 116 / (values.length - 1)
    const y = max === min ? 16 : 29 - (value - min) * 26 / (max - min)
    path += `${connected ? 'L' : 'M'}${x},${y} `
    connected = true
  })
  return <div className="vital-spark"><svg viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg><small>Last {points.length} valid readings</small></div>
}

function VitalsGrid({ sessions }: { sessions: Session[] }) {
  const latest = sessions[0]
  const latestMap = new Map(latest?.measurements.map(vital => [vital.vital_type, vital]))
  return <section className="vital-grid" aria-label="Latest vital readings">{Object.entries(vitalMeta).map(([key, meta]) => <VitalCard key={key} vital={latestMap.get(key as Vital['vital_type'])} label={meta.label} Icon={meta.icon}>{latest && <><VitalSparkline sessions={sessions} type={key as Vital['vital_type']} /><time className="spark-note" dateTime={latest.recorded_at}>Latest session · {time(latest.recorded_at)}</time></>}</VitalCard>)}</section>
}

function Trend({ sessions, alerts }: { sessions: Session[]; alerts: Alert[] }) {
  const reducedMotion = useReducedMotion()
  const [metric, setMetric] = useState<keyof typeof trendMetrics>('heart')
  const [range, setRange] = useState('all')
  const selected = trendMetrics[metric]
  const newest = Math.max(...sessions.map(session => Date.parse(session.recorded_at)))
  const visible = sessions.filter(session => range === 'all' || Date.parse(session.recorded_at) >= newest - Number(range) * 3_600_000)
  const alertSessions = new Set(alerts.map(alert => alert.session_id))
  const data = [...visible].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at)).map(session => {
    const find = (type: Vital['vital_type']) => session.measurements.find(vital => vital.vital_type === type && vital.quality_status !== 'INVALID')?.value
    return {
      stamp: Date.parse(session.recorded_at),
      hasAlert: alertSessions.has(session.id),
      heart: find('HEART_RATE'),
      spo2: find('SPO2'),
      temperature: find('TEMPERATURE'),
      respiratory: find('RESPIRATORY_RATE'),
    }
  })
  const sources = new Set(visible.map(session => session.source))
  const sourceLabel = sources.size > 1 ? 'Mixed simulated and ESP32 data' : sources.has('PHYSICAL_DEVICE') ? 'Physical ESP32 data' : 'Simulated data'
  const motion = { isAnimationActive: !reducedMotion, animationDuration: 850, animationEasing: 'ease-out' as const }
  return <div className="chart" aria-label="Recent vital trend chart"><div className="trend-tabs" role="tablist" aria-label="Trend legend and metric selector">{Object.entries(trendMetrics).map(([key, item]) => <button key={key} role="tab" aria-selected={metric === key} onClick={() => setMetric(key as keyof typeof trendMetrics)}><i style={{ background: item.color }} /><span>{item.label}<small>{item.unit}</small></span></button>)}</div><div className="trend-tools"><label>Time range <select className="filter-select" value={range} onChange={event => setRange(event.target.value)}><option value="all">All loaded readings</option><option value="24">Last 24 hours of readings</option><option value="168">Last 7 days of readings</option></select></label><small>{visible.length} sessions · Dashed markers show alert-linked readings</small></div>{visible.length < 2 ? <EmptyState title="Not enough readings in this range" body="Choose a wider range to see the trend." /> : <div className="chart-stage"><ResponsiveContainer width="100%" height={340}><AreaChart data={data} margin={{ top: 8, right: 12, bottom: 12, left: -12 }}><defs><linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={selected.color} stopOpacity={.22}/><stop offset="100%" stopColor={selected.color} stopOpacity={0}/></linearGradient></defs><Legend verticalAlign="top" align="right" height={42} iconType="plainline" iconSize={18} wrapperStyle={{fontFamily:'Inter, sans-serif',fontSize:11,color:'#514a40'}} /><CartesianGrid stroke="#d7cebf" strokeDasharray="2 5" vertical={false} /><XAxis dataKey="stamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={value => time(new Date(value).toISOString())} interval="preserveStartEnd" minTickGap={36} axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#736b5f'}} dy={8} /><YAxis unit={` ${selected.unit}`} width={66} axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#736b5f'}} /><Tooltip labelFormatter={value => time(new Date(Number(value)).toISOString())} cursor={{stroke:'#a89d8d', strokeDasharray:'3 4'}} contentStyle={{border:'1px solid #cabfad',borderRadius:10,fontFamily:'JetBrains Mono',boxShadow:'0 10px 30px rgba(61,48,35,.14)',background:'#fffaf1'}} labelStyle={{color:'#736b5f',marginBottom:6}} />{Array.from(new Set(data.filter(point => point.hasAlert).map(point => point.stamp))).map(stamp => <ReferenceLine key={stamp} x={stamp} stroke="var(--critical)" strokeDasharray="5 4" />)}<Area {...motion} type="monotoneX" connectNulls={false} dataKey={metric} name={`${selected.label} (${selected.unit})`} stroke={selected.color} strokeWidth={2.6} fill="url(#metricFill)" dot={{r:2.5, fill:'#fffaf1', strokeWidth:2}} activeDot={{r:5, strokeWidth:2, fill:'#fffaf1'}} /></AreaChart></ResponsiveContainer></div>}<div className="chart-origin"><span className="source-note">{sourceLabel}</span></div></div>
}

function AlertsList({ patientId, alerts, professional = false, compact = false }: { patientId: string; alerts: Alert[]; professional?: boolean; compact?: boolean }) {
  const client = useQueryClient()
  const [selectedId, select] = useState<string>()
  const [severity, setSeverity] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [date, setDate] = useState('')
  const drawer = useRef<HTMLDialogElement>(null)
  const selected = alerts.find(alert => alert.id === selectedId)
  const sessions = useQuery({ queryKey: ['sessions', patientId], queryFn: () => api.sessions(patientId), enabled: !!selected })
  useEffect(() => { if (selectedId && drawer.current && !drawer.current.open) drawer.current.showModal() }, [selectedId])
  const trigger = sessions.data?.find(session => session.id === selected?.session_id)
  const acknowledgement = useMutation({ mutationFn: api.acknowledge, onSuccess: () => client.invalidateQueries({ queryKey: ['alerts', patientId] }) })
  const visible = alerts.filter(alert =>
    (severity === 'ALL' || alert.severity === severity) &&
    (status === 'ALL' || alert.acknowledged === (status === 'REVIEWED')) &&
    (!date || new Date(alert.created_at).toDateString() === new Date(date + 'T00:00:00').toDateString())
  )
  return <div>
    {!compact && alerts.length > 0 && <div className="alert-filters">
      <label>Severity<select className="filter-select" value={severity} onChange={event => setSeverity(event.target.value)}><option value="ALL">All severities</option><option value="HIGH_RISK">Critical</option><option value="WARNING">Monitor</option><option value="NORMAL">Normal</option></select></label>
      <label>Review status<select className="filter-select" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Any status</option><option value="OPEN">Needs review</option><option value="REVIEWED">Reviewed</option></select></label>
      <label>Generated date<input className="filter-select" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    </div>}
    {!visible.length && <EmptyState icon="alerts" title={alerts.length ? 'No matching alerts' : 'No alerts'} body={alerts.length ? 'Try changing the filters.' : 'There are no alerts generated from persisted readings.'} />}
    {visible.map(alert => <div className="alert-row" key={alert.id}>
      <StatusBadge level={alert.severity} />
      <div><strong>{alert.message}</strong><small>{alert.acknowledged ? 'Reviewed' : 'Needs review'} · Generated <time dateTime={alert.created_at}>{time(alert.created_at)}</time></small></div>
      <button onClick={() => select(alert.id)}>View details</button>
    </div>)}
    <dialog ref={drawer} className="alert-drawer" aria-label="Alert details" onClose={() => select(undefined)}>
      {selected && <div>
        <div className="section-title"><div><span className="eyebrow">ALERT RECORD</span><h2>Alert details</h2></div><button className="back" onClick={() => drawer.current?.close()}>Close</button></div>
        <StatusBadge level={selected.severity} />
        <p>{selected.message}</p>
        <dl className="detail-list">
          <div><dt>Generated</dt><dd><time dateTime={selected.created_at}>{time(selected.created_at)}</time></dd></div>
          <div><dt>Review</dt><dd>{selected.acknowledged ? 'Reviewed' : 'Needs review'}</dd></div>
          {selected.acknowledged_at && <div><dt>Acknowledged</dt><dd>{time(selected.acknowledged_at)}</dd></div>}
          {professional && selected.acknowledged_by && <div><dt>Reviewer ID</dt><dd>{selected.acknowledged_by}</dd></div>}
        </dl>
        <h3>Triggering reading</h3>
        {sessions.isLoading ? <SkeletonBlock /> : sessions.isError ? <ErrorState message={sessions.error.message} retry={() => sessions.refetch()} /> : trigger ? <><p>{time(trigger.recorded_at)} · {trigger.source === 'SIMULATED' ? 'Simulated' : 'Device reading'}</p><dl className="detail-list">{trigger.measurements.map(vital => <div key={vital.vital_type}><dt>{label(vital.vital_type)}</dt><dd>{vital.value} {vital.unit} · {label(vital.quality_status)}</dd></div>)}</dl></> : <p>This reading is outside the loaded session history.</p>}
        {professional && !selected.acknowledged && <button className="primary" disabled={acknowledgement.isPending} onClick={() => acknowledgement.mutate(selected.id)}>{acknowledgement.isPending ? 'Acknowledging…' : 'Acknowledge alert'}</button>}
        {acknowledgement.isError && <div className="form-error" role="alert">{acknowledgement.error.message}</div>}
        {acknowledgement.data?.id === selected.id && <p className="success" role="status">Alert acknowledged.</p>}
      </div>}
    </dialog>
  </div>
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
  if (failed) return <ErrorState message={failed.error?.message ?? 'Unable to load patient information.'} retry={() => failed.refetch()} />
  const sessions = data.sessions.data ?? []
  const risk = data.risks.data?.[0]
  return <><PageHeading eyebrow={professional ? patient.patient_code : 'HOW AM I DOING'} title={professional ? patient.display_name : `Monitoring overview for ${patient.display_name}`} body={sessions[0] ? 'Latest reading: ' + time(sessions[0].recorded_at) + '. Review your vitals and recent activity below.' : 'This workspace is ready when the first monitoring reading arrives.'} />{professional && <DemoControls patientId={patient.id} />}<VitalsGrid sessions={sessions} /><section className="two-col"><div className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">DECISION SUPPORT</span><h2>Prototype Rule-Based Risk Assessment</h2></div>{risk && <StatusBadge level={risk.risk_level} />}</div>{risk ? <div className="risk-copy"><p>{risk.explanation}</p></div> : <EmptyState title="No assessment available" body="An assessment will appear after valid measurements are received." />}<RiskDisclosureNote /></div><div className="panel"><div className="section-title"><div><span className="eyebrow">CONNECTED SOURCE</span><h2>Monitoring status</h2></div></div><DeviceList devices={data.devices.data ?? []} /></div></section><section className="panel"><div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Recent alerts</h2></div><Link to={professional ? '/doctor/alerts' : '/patient/alerts'}>View all →</Link></div><AlertsList patientId={patient.id} alerts={(data.alerts.data ?? []).slice(0, 3)} professional={professional} compact /></section><ActivityTimeline sessions={sessions} alerts={data.alerts.data ?? []} devices={data.devices.data ?? []} />{professional ? <ClinicianCare key={patient.id} patient={patient} /> : <section className="panel care-summary"><span className="eyebrow">FROM YOUR CARE TEAM</span><h2>Your care summary</h2><p>Read your clinician’s latest review, precautions and next steps.</p><Link className="back" to="/patient/summary">Open care summary →</Link></section>}</>
}

export function PatientDashboard() {
  const { patients, patient } = usePatientProfile()
  if (patients.isLoading) return <Loading />
  if (patients.isError) return <div className="workspace"><ErrorState message={patients.error.message} retry={() => patients.refetch()} /></div>
  if (!patient) return <div className="workspace"><PageHeading eyebrow="MONITORING OVERVIEW" title="Welcome to PulseBridge" body="Your monitoring workspace is ready for a healthcare professional to connect." /><EmptyState title="No patient profile linked" body="A healthcare professional must create and link your monitoring profile before readings can appear." /></div>
  return <div className="workspace"><PatientDetail patient={patient} /></div>
}

export function PatientSummary() {
  return <div className="workspace"><PageHeading eyebrow="YOUR CARE TEAM" title="Care summary" body="Read the reviews and next steps published by your clinician." /><PatientPage emptyTitle="No patient profile linked" emptyBody="A linked profile is required to receive a care summary.">{patient => <SummaryContent patient={patient} />}</PatientPage></div>
}

export function DoctorFollowUps() {
  const patients = useAssignedPatients()
  return <div className="workspace"><PageHeading eyebrow="CLINICIAN WORKSPACE" title="Follow-ups" body="Review open care tasks for assigned patients, ordered by due date." />{patients.isLoading ? <Loading /> : patients.isError ? <ErrorState message={patients.error.message} retry={() => patients.refetch()} /> : <FollowUpQueue patients={patients.data ?? []} />}</div>
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
  const alerts = useQuery({ queryKey: ['alerts', patient.id], queryFn: () => api.alerts(patient.id) })
  const sessions = useQuery({ queryKey: ['sessions', patient.id], queryFn: () => api.sessions(patient.id) })
  if (sessions.isLoading) return <SkeletonBlock variant="chart" />
  if (sessions.isError) return <ErrorState message={sessions.error.message} retry={() => sessions.refetch()} />
  const history = sessions.data ?? []
  return <section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">RECENT SESSIONS</span><h2>Vital trend</h2></div></div>{alerts.isError && <ErrorState message="Alert markers are unavailable." retry={() => alerts.refetch()} />}{history.length > 1 ? <Trend sessions={history} alerts={alerts.data ?? []} /> : <EmptyState title="Not enough data yet for a trend" body="At least two persisted sessions are required. PulseBridge never interpolates or invents missing measurements." />}</section>
}

export function PatientAlerts() {
  return <div className="workspace"><PageHeading eyebrow="MONITORING NOTIFICATIONS" title="Alerts" body="View alerts generated from your persisted measurements." /><PatientPage emptyTitle="No alerts" emptyBody="Alerts will appear here after a monitoring profile is linked and qualifying measurements are received.">{patient => <PatientAlertsContent patient={patient} />}</PatientPage></div>
}

function PatientAlertsContent({ patient }: { patient: Patient }) {
  const alerts = useQuery({ queryKey: ['alerts', patient.id], queryFn: () => api.alerts(patient.id) })
  if (alerts.isLoading) return <Loading />
  if (alerts.isError) return <ErrorState message={alerts.error.message} retry={() => alerts.refetch()} />
  return <section className="panel"><AlertsList patientId={patient.id} alerts={alerts.data ?? []} /></section>
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
  const monitoringQueries = [...alertQueries, ...deviceQueries, ...sessionQueries]
  if (monitoringQueries.some(query => query.isError)) return <div className="workspace"><ErrorState message="The attention queue could not load all monitoring data." retry={() => Promise.all(monitoringQueries.filter(query => query.isError).map(query => query.refetch()))} /></div>
  const queue = assigned.map((patient, index) => {
    const alerts = alertQueries[index].data ?? []
    const devices = deviceQueries[index].data ?? []
    const sessions = sessionQueries[index].data ?? []
    const active = alerts.filter(alert => !alert.acknowledged)
    const severity = active.some(alert => alert.severity === 'HIGH_RISK') ? 2 : active.some(alert => alert.severity === 'WARNING') ? 1 : 0
    return { patient, active, devices, latest: sessions[0], severity, deviceIssues: devices.filter(device => device.status !== 'ONLINE').length }
  }).sort((left, right) => right.severity - left.severity || right.deviceIssues - left.deviceIssues || (right.active[0]?.created_at ?? '').localeCompare(left.active[0]?.created_at ?? ''))
  const activeAlerts = queue.reduce((total, row) => total + row.active.length, 0)
  const devicesNeedingAttention = queue.reduce((total, row) => total + row.devices.filter(device => device.status !== 'ONLINE').length, 0)
  return <div className="workspace"><PageHeading eyebrow="TRIAGE OVERVIEW" title="Attention queue" body="Review assigned patients with unresolved alerts and devices that need attention." /><div className="summary"><article><Users /><strong>{assigned.length}</strong><span>Assigned patients</span></article><article><AlertTriangle /><strong>{activeAlerts}</strong><span>Unresolved alerts</span></article><article><Activity /><strong>{devicesNeedingAttention}</strong><span>Devices needing attention</span></article></div><section className="panel instrument-panel"><div className="section-title"><div><span className="eyebrow">REAL SIGNALS ONLY</span><h2>Review priority</h2></div><Link to="/doctor/patients">Manage patients →</Link></div>{queue.length ? <div className="triage-list">{queue.map(row => <Link key={row.patient.id} to={`/doctor/patients/${row.patient.id}`}><span className="avatar">{row.patient.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{row.patient.display_name}</strong><small>{row.patient.patient_code} · {row.latest ? 'Last reading ' + time(row.latest.recorded_at) : 'No measurements yet'}</small></span><StatusBadge status={row.severity === 2 ? 'HIGH_RISK' : row.severity === 1 || row.deviceIssues ? 'WARNING' : 'NORMAL'} label={row.active.length ? `${row.active.length} unresolved` : row.deviceIssues ? `${row.deviceIssues} device issues` : 'Clear'} /></Link>)}</div> : <EmptyState icon="patients" title="No patients assigned" body="Create and link a patient monitoring profile to begin." />}</section></div>
}

function PatientDirectory({ patients }: { patients: Patient[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const queries = useQueries({ queries: patients.map(patient => ({
    queryKey: ['directory', patient.id, filter],
    enabled: filter !== 'all',
    queryFn: async () => filter === 'alerts'
      ? (await api.alerts(patient.id)).some(alert => !alert.acknowledged)
      : filter === 'devices'
        ? (await api.devices(patient.id)).some(device => device.status !== 'ONLINE')
        : (await api.sessions(patient.id)).some(session => Date.parse(session.recorded_at) >= Date.now() - 86_400_000),
  })) })
  const term = search.trim().toLowerCase()
  const visible = patients.filter((patient, index) =>
    (patient.display_name.toLowerCase().includes(term) || patient.patient_code.toLowerCase().includes(term)) &&
    (filter === 'all' || queries[index]?.data === true)
  )
  return <><div className="alert-filters">
    <label>Search patients<input className="filter-select" type="search" placeholder="Name or patient code" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <label>Monitoring filter<select className="filter-select" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All assigned patients</option><option value="alerts">Unresolved alerts</option><option value="devices">Device needs attention</option><option value="recent">Reading in the last 24 hours</option></select></label>
  </div>{queries.some(query => query.isLoading) ? <SkeletonBlock variant="row" count={2} /> : queries.some(query => query.isError) ? <ErrorState message="The selected filter could not load monitoring data." retry={() => queries.filter(query => query.isError).forEach(query => { void query.refetch() })} /> : visible.length || !patients.length ? <PatientLinks patients={visible} /> : <EmptyState title="No matching patients" body="Try a different name, code, or monitoring filter." />}</>
}

function PatientLinks({ patients }: { patients: Patient[] }) {
  const client = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<Patient>()
  const [notice, setNotice] = useState('')
  const removal = useMutation({
    mutationFn: api.removePatientAssignment,
    onSuccess: async (_, id) => {
      client.setQueryData<Patient[]>(['patients'], current => current?.filter(item => item.id !== id))
      await client.invalidateQueries({ queryKey: ['patients'] })
      setNotice('Patient removed from your monitoring list.')
      dialog.current?.close()
    },
  })
  return <>
    {notice && <p className="success" role="status">{notice}</p>}
    {patients.length ? <div className="patient-list">{patients.map(patient => <div className="patient-list-item" key={patient.id}>
      <Link to={`/doctor/patients/${patient.id}`}><span className="avatar">{patient.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{patient.display_name}</strong><small>{patient.patient_code}</small></span><span className="open">Open record →</span></Link>
      <button className="remove-patient" aria-label={`Remove ${patient.display_name} from your list`} onClick={() => {
        removal.reset()
        setNotice('')
        setSelected(patient)
        dialog.current?.showModal()
      }}>Remove</button>
    </div>)}</div> : <EmptyState icon="patients" title="No patients assigned" body="Create and link a patient monitoring profile to begin." />}
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="remove-patient-title" onCancel={event => { if (removal.isPending) event.preventDefault() }}>
      <h2 id="remove-patient-title">Remove patient from your list?</h2>
      <p><strong>{selected?.display_name}</strong> will no longer appear in your workspace. Their account and monitoring history will be kept.</p>
      {removal.isError && <p className="form-error" role="alert">{removal.error.message}</p>}
      <div className="confirm-actions"><button className="back" autoFocus disabled={removal.isPending} onClick={() => dialog.current?.close()}>Cancel</button><button className="remove-patient" disabled={removal.isPending || !selected} onClick={() => selected && removal.mutate(selected.id)}>{removal.isPending ? 'Removing…' : 'Remove patient'}</button></div>
    </dialog>
  </>
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
  return <div className="workspace"><PageHeading eyebrow="CARE RELATIONSHIPS" title="Patients" body="Create a monitoring profile and optionally link it to an existing patient account." /><section className="panel"><div className="section-title"><div><span className="eyebrow">NEW PROFILE</span><h2>Create and assign patient</h2></div></div><form className="patient-form" onSubmit={submit}><label>Patient code<input name="patient_code" required pattern="[A-Za-z0-9-]{3,40}" placeholder="PAT-001" /></label><label>Display name<input name="display_name" required minLength={2} placeholder="Patient name" /></label><label>Patient account email <small>(optional)</small><input name="linked_user_email" type="email" placeholder="patient@example.com" /></label><button className="primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create patient profile'}</button></form>{create.isError && <div className="form-error" role="alert">{create.error.message}</div>}{create.isSuccess && <div className="success" role="status">Patient profile created and assigned to you.</div>}</section><section className="panel"><div className="section-title"><div><span className="eyebrow">ASSIGNED TO YOU</span><h2>Monitoring list</h2></div></div>{patients.isLoading ? <Loading /> : patients.isError ? <ErrorState message={patients.error.message} /> : <PatientDirectory patients={patients.data ?? []} />}</section></div>
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

function label(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function metric(value: number | number[][] | undefined) {
  return typeof value === 'number' ? value.toFixed(3) : '—'
}

function MLAnalyticsWorkspace({ patient }: { patient: Patient }) {
  const client = useQueryClient()
  const model = useQuery({ queryKey: ['ml-model'], queryFn: api.mlModel })
  const history = useQuery({ queryKey: ['ml-predictions', patient.id], queryFn: () => api.mlPredictions(patient.id) })
  const inference = useMutation({
    mutationFn: () => api.mlPredict(patient.id),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['ml-predictions', patient.id] }),
  })
  if (model.isLoading || history.isLoading) return <Loading />
  if (model.isError) return <ErrorState message={model.error.message} retry={() => model.refetch()} />
  if (history.isError) return <ErrorState message={history.error.message} retry={() => history.refetch()} />
  const details = model.data
  const result = inference.data ?? history.data?.[0]
  const comparison = Object.entries(details.model_comparison)
  const importance = Object.entries(details.global_feature_importance)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1])).slice(0, 6)
  return <>
    <section className="ml-hero">
      <div className="ml-orbit"><BrainCircuit /></div>
      <div><span className="eyebrow">RESEARCH MODEL · {details.model_version}</span><h2>{details.target}</h2><p>Independent ICU research model using {details.input_window_hours}-hour heart-rate and temperature summaries. It remains separate from PulseBridge’s rule-based monitoring assessment.</p></div>
      <button className="ml-run" disabled={!details.available || inference.isPending} onClick={() => inference.mutate()}>{inference.isPending ? <LoaderCircle /> : <Play />}{inference.isPending ? 'Analysing…' : 'Run research inference'}</button>
    </section>
    {inference.isPending && <p className="progress-note" role="status">Analysing saved readings…</p>}
    {inference.isError && <div className="form-error" role="alert">{inference.error.message}</div>}
    <section className="ml-grid">
      <article className="panel ml-result"><div className="section-title"><div><span className="eyebrow">LATEST OUTCOME</span><h2>Model result</h2></div><span className={`ml-availability ${result?.available ? 'ready' : ''}`}>{result?.available ? 'Available' : 'Unavailable'}</span></div>
        {result?.available ? <><strong className="ml-outcome">{label(result.predicted_label ?? '')}</strong><div className="probability"><span style={{ width: `${(result.probability ?? 0) * 100}%` }} /></div><div className="ml-numbers"><span><strong>{((result.probability ?? 0) * 100).toFixed(1)}%</strong> model probability</span><span><strong>{(result.decision_threshold * 100).toFixed(0)}%</strong> decision threshold</span></div><p>{result.explanation}</p><dl className="detail-list"><div><dt>Source</dt><dd>{label(result.source_data ?? 'Unavailable')}</dd></div>{result.window_started_at && result.window_ended_at && <div><dt>Saved readings used</dt><dd>{time(result.window_started_at)} – {time(result.window_ended_at)}</dd></div>}<div><dt>Model version</dt><dd>{result.model_version}</dd></div></dl></> : <div className="ml-unavailable"><Database /><div><strong>No model result yet</strong><p>{result?.explanation ?? details.unavailable_reason ?? 'Click Run research inference to analyse your saved heart-rate and temperature readings. A full 12 hours is not required.'}</p></div></div>}
        <div className="synthetic-warning"><AlertTriangle /><span><strong>Demonstration boundary</strong> PulseBridge readings are synthetic and outside this model’s validation population. This output is not a diagnosis.</span></div>
      </article>
      <article className="panel ml-facts"><div className="section-title"><div><span className="eyebrow">MODEL CARD</span><h2>Evidence at a glance</h2></div></div><dl><div><dt>Training</dt><dd>{details.development_partition}</dd></div><div><dt>Held-out test</dt><dd>{details.held_out_partition}</dd></div><div><dt>Inputs</dt><dd>{details.supported_parameters.map(label).join(' · ')}</dd></div><div><dt>ROC-AUC</dt><dd>{metric(details.held_out_metrics.roc_auc)}</dd></div><div><dt>PR-AUC</dt><dd>{metric(details.held_out_metrics.pr_auc)}</dd></div><div><dt>Recall</dt><dd>{metric(details.held_out_metrics.recall)}</dd></div></dl></article>
    </section>
    <section className="panel"><div className="section-title"><div><span className="eyebrow">ACTUAL CROSS-VALIDATION RESULTS</span><h2>Model comparison</h2></div></div><div className="table-wrap"><table className="history-table model-table"><thead><tr><th>Candidate</th><th>ROC-AUC</th><th>PR-AUC</th><th>Recall</th><th>Brier score</th></tr></thead><tbody>{comparison.map(([name, scores]) => <tr key={name} className={name === 'random_forest' ? 'selected-model' : ''}><td data-label="Candidate"><strong>{label(name)}</strong>{name === 'random_forest' && <small>Selected</small>}</td><td data-label="ROC-AUC">{metric(scores.roc_auc)}</td><td data-label="PR-AUC">{metric(scores.pr_auc)}</td><td data-label="Recall">{metric(scores.recall)}</td><td data-label="Brier score">{metric(scores.brier_score)}</td></tr>)}</tbody></table></div></section>
    <section className="ml-grid"><article className="panel"><div className="section-title"><div><span className="eyebrow">GLOBAL EXPLAINABILITY</span><h2>Most influential features</h2></div></div><div className="importance-list">{importance.map(([name, value]) => <div key={name}><span>{label(name)}</span><i><b style={{ width: `${Math.max(4, Math.abs(value) / Math.max(...importance.map(item => Math.abs(item[1]))) * 100)}%` }} /></i><code>{value.toFixed(4)}</code></div>)}</div><p className="fine-print">Permutation importance describes global predictive contribution on held-out data. It does not establish causation or explain an individual patient outcome.</p></article><article className="panel"><div className="section-title"><div><span className="eyebrow">KNOWN LIMITATIONS</span><h2>Interpret with care</h2></div></div><ul className="limitation-list">{details.limitations.map(item => <li key={item}>{item}</li>)}</ul></article></section>
  </>
}

export function PatientAnalytics() {
  return <div className="workspace"><PageHeading eyebrow="AI ANALYTICS" title="Research model" body="Explore a transparent, separately labelled machine-learning outcome based on eligible monitoring history." /><PatientPage emptyTitle="No patient profile linked" emptyBody="A linked monitoring profile is required before research inference can run.">{patient => <MLAnalyticsWorkspace patient={patient} />}</PatientPage></div>
}

export function DoctorAnalytics() {
  const patients = useAssignedPatients()
  const [selectedId, setSelectedId] = useState('')
  if (patients.isLoading) return <Loading />
  if (patients.isError) return <div className="workspace"><ErrorState message={patients.error.message} retry={() => patients.refetch()} /></div>
  const assigned = patients.data ?? []
  const patient = assigned.find(item => item.id === selectedId) ?? assigned[0]
  return <div className="workspace"><PageHeading eyebrow="AI ANALYTICS" title="Research model" body="Review independently evaluated model evidence and run authorized inference for an assigned patient." />{patient ? <><label className="patient-picker">Patient<select value={patient.id} onChange={event => setSelectedId(event.target.value)}>{assigned.map(item => <option key={item.id} value={item.id}>{item.display_name} · {item.patient_code}</option>)}</select></label><MLAnalyticsWorkspace patient={patient} /></> : <EmptyState icon="patients" title="No patients assigned" body="Assign a patient before running research inference." />}</div>
}

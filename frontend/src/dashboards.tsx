import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode } from 'react'
import { Activity, HeartPulse, Stethoscope, Thermometer, Users } from 'lucide-react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from './api'
import { EmptyState, ErrorState, Loading, StatusBadge } from './components'
import type { Alert, Device, Patient, Session, User, Vital } from './types'

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
  if (patients.isError) return <ErrorState message={patients.error.message} />
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

function VitalCard({ vital, diastolic, label, Icon, recordedAt }: { vital?: Vital; diastolic?: Vital; label: string; Icon: typeof Activity; recordedAt?: string }) {
  return <article className="vital"><div><span className="vital-icon"><Icon /></span><span className={`quality ${vital?.quality_status.toLowerCase() ?? ''}`}>{vital?.quality_status ?? 'UNAVAILABLE'}</span></div><p>{label}</p>{vital ? <><strong>{vital.value}{diastolic && ` / ${diastolic.value}`} <small>{vital.unit}</small></strong><span>{recordedAt ? `Measured ${time(recordedAt)}` : 'Latest persisted reading'}</span></> : <><strong>—</strong><span>No reading received</span></>}</article>
}

function VitalsGrid({ sessions }: { sessions: Session[] }) {
  const latest = sessions[0]
  const latestMap = new Map(latest?.measurements.map(vital => [vital.vital_type, vital]))
  return <section className="vital-grid">{Object.entries(vitalMeta).map(([key, meta]) => <VitalCard key={key} vital={key === 'SYSTOLIC_BP' ? latestMap.get('SYSTOLIC_BP') : latestMap.get(key as Vital['vital_type'])} diastolic={key === 'SYSTOLIC_BP' ? latestMap.get('DIASTOLIC_BP') : undefined} label={meta.label} Icon={meta.icon} recordedAt={latest?.recorded_at} />)}</section>
}

function Trend({ sessions }: { sessions: Session[] }) {
  const data = [...sessions].reverse().map(session => {
    const find = (type: Vital['vital_type']) => session.measurements.find(vital => vital.vital_type === type)?.value
    return { name: new Date(session.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), heart: find('HEART_RATE'), spo2: find('SPO2'), temperature: find('TEMPERATURE') }
  })
  return <div className="chart" aria-label="Recent vital trend chart"><ResponsiveContainer width="100%" height={300}><LineChart data={data}><CartesianGrid stroke="#e5e8e4" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Line type="monotone" dataKey="heart" name="Heart rate" stroke="#b45a3c" strokeWidth={2} /><Line type="monotone" dataKey="spo2" name="SpO₂" stroke="#287b73" strokeWidth={2} /><Line type="monotone" dataKey="temperature" name="Temperature" stroke="#7b6b9d" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
}

function AlertsList({ patientId, alerts, professional = false }: { patientId: string; alerts: Alert[]; professional?: boolean }) {
  const client = useQueryClient()
  const acknowledgement = useMutation({ mutationFn: api.acknowledge, onSuccess: () => client.invalidateQueries({ queryKey: ['alerts', patientId] }) })
  if (!alerts.length) return <EmptyState icon="alerts" title="No alerts" body="There are no alerts generated from persisted readings." />
  return <div>{alerts.map(alert => <div className={`alert-row ${alert.acknowledged ? 'ack' : ''}`} key={alert.id}><StatusBadge level={alert.severity} /><div><strong>{alert.message}</strong><small>{time(alert.created_at)} · {alert.acknowledged ? 'Acknowledged' : 'Needs review'}</small></div>{professional && !alert.acknowledged && <button disabled={acknowledgement.isPending} onClick={() => acknowledgement.mutate(alert.id)}>Acknowledge</button>}</div>)}</div>
}

function DeviceList({ devices }: { devices: Device[] }) {
  if (!devices.length) return <EmptyState title="No monitoring device linked" body="A device will appear here after a healthcare professional links it to this profile." />
  return <div className="device-list">{devices.map(device => <article className="device-row" key={device.id}>{device.device_type === 'SIMULATOR' && <span className="sim-label">SIMULATED DEVICE</span>}<strong>{device.device_uid}</strong><p>{device.device_type} · {device.status}</p><small>{device.last_seen_at ? `Last seen ${time(device.last_seen_at)}` : 'No measurements received'}{device.firmware_version ? ` · Firmware ${device.firmware_version}` : ''}</small></article>)}</div>
}

function PatientDetail({ patient, professional = false }: { patient: Patient; professional?: boolean }) {
  const data = usePatientData(patient.id)
  if (data.queries.some(query => query.isLoading)) return <Loading />
  const failed = data.queries.find(query => query.error)
  if (failed) return <ErrorState message={failed.error?.message ?? 'Unable to load patient information.'} />
  const sessions = data.sessions.data ?? []
  const risk = data.risks.data?.[0]
  return <><PageHeading eyebrow={professional ? patient.patient_code : 'YOUR MONITORING OVERVIEW'} title={professional ? patient.display_name : `Monitoring overview for ${patient.display_name}`} body={sessions[0] ? `Latest synthetic synchronization ${time(sessions[0].recorded_at)}` : 'This workspace is ready when the first simulated reading arrives.'} /><VitalsGrid sessions={sessions} /><section className="two-col"><div className="panel"><div className="section-title"><div><span className="eyebrow">DECISION SUPPORT</span><h2>Prototype Risk Assessment</h2></div>{risk && <StatusBadge level={risk.risk_level} />}</div>{risk ? <div className="risk-copy"><p>{risk.explanation}</p><small>Assessed {time(risk.created_at)} using temporary rule-based thresholds. This is not a diagnosis or clinically validated prediction.</small></div> : <EmptyState title="No assessment available" body="A prototype assessment will appear after valid simulated measurements are received." />}</div><div className="panel"><div className="section-title"><div><span className="eyebrow">CONNECTED SOURCE</span><h2>Monitoring device</h2></div></div><DeviceList devices={data.devices.data ?? []} /></div></section><section className="panel"><div className="section-title"><div><span className="eyebrow">ATTENTION QUEUE</span><h2>Recent alerts</h2></div></div><AlertsList patientId={patient.id} alerts={data.alerts.data ?? []} professional={professional} /></section></>
}

export function PatientDashboard() {
  return <div className="workspace"><PageHeading eyebrow="MONITORING OVERVIEW" title="Overview" body="Your monitoring status, latest measurements, prototype assessment, and recent alerts." /><PatientPage emptyTitle="No patient profile linked" emptyBody="A healthcare professional must create and link your monitoring profile before readings can appear.">{patient => <PatientDetail patient={patient} />}</PatientPage></div>
}

export function PatientVitals() {
  return <div className="workspace"><PageHeading eyebrow="MEASUREMENT HISTORY" title="Vitals" body="Review measurements received from your linked monitoring source." /><PatientPage emptyTitle="No measurements yet" emptyBody="Readings will appear after a monitoring profile and device are linked and measurements are received.">{patient => <PatientVitalsContent patient={patient} />}</PatientPage></div>
}

function PatientVitalsContent({ patient }: { patient: Patient }) {
  const sessions = useQuery({ queryKey: ['sessions', patient.id], queryFn: () => api.sessions(patient.id) })
  if (sessions.isLoading) return <Loading />
  if (sessions.isError) return <ErrorState message={sessions.error.message} />
  const history = sessions.data ?? []
  return <><VitalsGrid sessions={history} /><section className="panel trends"><div className="section-title"><div><span className="eyebrow">PERSISTED MEASUREMENTS</span><h2>Vital trends</h2></div><span>Recent sessions</span></div>{history.length > 1 ? <Trend sessions={history} /> : <EmptyState title="Trend unavailable" body="At least two persisted sessions are needed before a meaningful trend can be shown." />}</section></>
}

export function PatientAlerts() {
  return <div className="workspace"><PageHeading eyebrow="MONITORING NOTIFICATIONS" title="Alerts" body="View alerts generated from your persisted measurements." /><PatientPage emptyTitle="No alerts" emptyBody="Alerts will appear here after a monitoring profile is linked and qualifying measurements are received.">{patient => <PatientAlertsContent patient={patient} />}</PatientPage></div>
}

function PatientAlertsContent({ patient }: { patient: Patient }) {
  const alerts = useQuery({ queryKey: ['alerts', patient.id], queryFn: () => api.alerts(patient.id) })
  if (alerts.isLoading) return <Loading />
  if (alerts.isError) return <ErrorState message={alerts.error.message} />
  return <section className="panel"><AlertsList patientId={patient.id} alerts={alerts.data ?? []} /></section>
}

export function PatientDevices() {
  return <div className="workspace"><PageHeading eyebrow="CONNECTED MONITORING" title="Devices" body="Review the status and last contact time of your linked monitoring source." /><PatientPage emptyTitle="No monitoring device linked" emptyBody="A device will appear after a healthcare professional creates and links your monitoring profile and device.">{patient => <PatientDevicesContent patient={patient} />}</PatientPage></div>
}

function PatientDevicesContent({ patient }: { patient: Patient }) {
  const devices = useQuery({ queryKey: ['devices', patient.id], queryFn: () => api.devices(patient.id) })
  if (devices.isLoading) return <Loading />
  if (devices.isError) return <ErrorState message={devices.error.message} />
  return <section className="panel"><DeviceList devices={devices.data ?? []} /></section>
}

function useAssignedPatients() { return useQuery({ queryKey: ['patients'], queryFn: api.patients }) }

export function DoctorDashboard() {
  const patients = useAssignedPatients()
  if (patients.isLoading) return <Loading />
  if (patients.isError) return <ErrorState message={patients.error.message} />
  return <div className="workspace"><PageHeading eyebrow="CLINICAL MONITORING WORKSPACE" title="Professional overview" body="Review only the synthetic patients assigned to your account." /><div className="summary"><article><Users /><strong>{patients.data?.length ?? 0}</strong><span>Assigned patients</span></article><article><Activity /><strong>—</strong><span>Open a patient record for monitoring status</span></article></div><section className="panel"><div className="section-title"><div><span className="eyebrow">ASSIGNED TO YOU</span><h2>Monitoring list</h2></div><Link to="/doctor/patients">Manage patients →</Link></div><PatientLinks patients={patients.data ?? []} /></section></div>
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

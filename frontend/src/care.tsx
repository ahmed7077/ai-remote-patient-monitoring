import { useState, type FormEvent } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Bell, CheckCircle2, Cpu } from 'lucide-react'
import { Link } from 'react-router-dom'

import { api } from './api'
import { EmptyState, ErrorState, SkeletonBlock } from './components'
import type { Alert, CareEntry, CareInput, Device, Patient, Session } from './types'

const clock = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const when = (value: string) => clock.format(new Date(value))

export function ActivityTimeline({ sessions, alerts, devices }: { sessions: Session[]; alerts: Alert[]; devices: Device[] }) {
  const [expanded, setExpanded] = useState(false)
  const events = [
    ...sessions.map(session => ({ key: session.id, date: session.recorded_at, title: 'Reading recorded', body: session.source === 'SIMULATED' ? 'Simulated monitoring session' : 'Physical device session', Icon: Activity })),
    ...alerts.flatMap(alert => [
      { key: alert.id, date: alert.created_at, title: 'Alert generated', body: alert.message, Icon: Bell },
      ...(alert.acknowledged_at ? [{ key: alert.id + '-review', date: alert.acknowledged_at, title: 'Alert acknowledged', body: alert.message, Icon: CheckCircle2 }] : []),
    ]),
    ...devices.flatMap(device => device.last_seen_at ? [{ key: device.id, date: device.last_seen_at, title: 'Latest device contact', body: device.device_uid, Icon: Cpu }] : []),
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
  return <section className="panel"><div className="section-title"><div><span className="eyebrow">MONITORING HISTORY</span><h2>Activity timeline</h2></div></div>
    {events.length ? <ol className="care-timeline">{events.slice(0, expanded ? 24 : 6).map(({ key, date, title, body, Icon }) => <li key={key}><span className="timeline-icon"><Icon aria-hidden="true" /></span><div><strong>{title}</strong><p>{body}</p></div><time dateTime={date}>{when(date)}</time></li>)}</ol> : <EmptyState title="No activity recorded" body="Readings, alerts and device contact will appear here." />}
    {events.length > 6 && <button className="back" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer events' : 'Show more events'}</button>}
  </section>
}

function CareEntries({ entries, complete, busy }: { entries: CareEntry[]; complete?: (id: string) => void; busy?: boolean }) {
  return <ul className="care-entries">{entries.map(entry => <li key={entry.id}>
    <span className="eyebrow">{entry.kind === 'note' ? 'CLINICIAN NOTE' : entry.kind === 'summary' ? 'PUBLISHED SUMMARY' : entry.completed_at ? 'COMPLETED FOLLOW-UP' : 'OPEN FOLLOW-UP'}</span>
    <p className="care-text">{entry.body}</p>
    <small>{entry.author_name} · {when(entry.created_at)}{entry.due_date && ' · Due ' + entry.due_date}</small>
    {entry.kind === 'follow_up' && !entry.completed_at && complete && <button className="back" disabled={busy} onClick={() => complete(entry.id)}>Mark complete</button>}
  </li>)}</ul>
}

export function ClinicianCare({ patient }: { patient: Patient }) {
  const client = useQueryClient()
  const key = ['care', patient.id]
  const entries = useQuery({ queryKey: key, queryFn: () => api.care(patient.id) })
  const [kind, setKind] = useState<CareInput['kind']>('note')
  const [review, setReview] = useState('')
  const [body, setBody] = useState('')
  const [precautions, setPrecautions] = useState('')
  const [date, setDate] = useState('')
  const [approved, setApproved] = useState(false)
  const save = useMutation({
    mutationFn: (input: CareInput) => api.addCare(patient.id, input),
    onSuccess: () => {
      setBody(''); setReview(''); setPrecautions(''); setDate(''); setApproved(false)
      return client.invalidateQueries({ queryKey: key })
    },
  })
  const complete = useMutation({ mutationFn: (entry: string) => api.completeFollowUp(patient.id, entry), onSuccess: () => client.invalidateQueries({ queryKey: key }) })
  const draft = useMutation({ mutationFn: () => api.draftCare(patient.id, review), onSuccess: value => { setBody(value.draft); setApproved(false) } })
  const busy = save.isPending || draft.isPending
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!body.trim() || busy || (kind === 'summary' && !approved)) return
    save.mutate({ kind, body, approved: kind === 'summary' ? approved : undefined, precautions: kind === 'summary' ? precautions.trim() || undefined : undefined, due_date: kind === 'follow_up' ? date : undefined })
  }
  return <section className="panel" aria-label="Care workspace">
    <div className="section-title"><div><span className="eyebrow">CLINICIAN WORKSPACE</span><h2>Notes, follow-ups and summaries</h2></div></div>
    <form className="care-form" onSubmit={submit}>
      <label>Entry type<select className="filter-select" value={kind} disabled={busy} onChange={event => { setKind(event.target.value as CareInput['kind']); setBody(''); setApproved(false); save.reset(); draft.reset() }}>
        <option value="note">Private clinician note</option><option value="follow_up">Follow-up task</option><option value="summary">Patient summary</option>
      </select></label>
      {kind === 'summary' && <>
        <label>Review observations<textarea value={review} onChange={event => { setReview(event.target.value); setApproved(false) }} disabled={busy} maxLength={4000} placeholder="Use fictional observations for hosted AI testing. Do not enter patient identifiers." /></label>
        <button type="button" className="back" disabled={busy || !review.trim()} onClick={() => draft.mutate()}>{draft.isPending ? 'Drafting…' : 'Draft with AI'}</button>
        {draft.isError && <p role="alert" className="form-error">{draft.error.message}</p>}
      </>}
      <label>{kind === 'summary' ? 'Patient-facing summary' : kind === 'note' ? 'Note' : 'Follow-up task'}<textarea required maxLength={4000} disabled={busy} value={body} onChange={event => { setBody(event.target.value); setApproved(false) }} /></label>
      {kind === 'follow_up' && <label>Due date<input className="filter-select" type="date" required value={date} onChange={event => setDate(event.target.value)} disabled={busy} /></label>}
      {kind === 'summary' && <>
        <label>Precautions and next steps<textarea value={precautions} onChange={event => { setPrecautions(event.target.value); setApproved(false) }} disabled={busy} maxLength={4000} placeholder="Write the exact instructions to share. AI does not fill in this field." /></label>
        <label className="care-check"><input type="checkbox" required checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)} /> I reviewed this text and approve sharing it with the patient.</label>
      </>}
      <button className="primary" disabled={busy || !body.trim() || (kind === 'summary' && !approved)}>{save.isPending ? 'Saving…' : kind === 'summary' ? 'Publish to patient' : kind === 'note' ? 'Save private note' : 'Create follow-up'}</button>
      {save.isSuccess && <p className="success" role="status">Entry saved.</p>}
      {save.isError && <p className="form-error" role="alert">{save.error.message}</p>}
    </form>
    {entries.isLoading ? <SkeletonBlock variant="row" count={2} /> : entries.isError ? <ErrorState message={entries.error.message} retry={() => entries.refetch()} /> : entries.data?.length ? <CareEntries entries={entries.data} complete={complete.mutate} busy={complete.isPending} /> : <EmptyState title="No care entries yet" body="Record a note, create a follow-up, or publish a summary." />}
    {complete.isError && <p className="form-error" role="alert">{complete.error.message}</p>}
  </section>
}

export function SummaryContent({ patient }: { patient: Patient }) {
  const entries = useQuery({ queryKey: ['care', patient.id], queryFn: () => api.care(patient.id) })
  if (entries.isLoading) return <SkeletonBlock count={2} />
  if (entries.isError) return <ErrorState message={entries.error.message} retry={() => entries.refetch()} />
  const [latest, ...earlier] = (entries.data ?? []).filter(entry => entry.kind === 'summary')
  if (!latest) return <EmptyState title="No summary published yet" body="A summary will appear after your clinician reviews and publishes it." />
  return <><section className="panel care-summary"><span className="eyebrow">REVIEWED BY YOUR CLINICIAN</span><h2>What your clinician reviewed</h2><p className="care-text">{latest.body}</p><small>{latest.author_name} · <time dateTime={latest.created_at}>{when(latest.created_at)}</time></small></section>
    <section className="panel"><span className="eyebrow">FROM YOUR CLINICIAN</span><h2>Precautions and next steps</h2><p className="care-text">{latest.precautions ?? 'No precautions or next steps were included in this review.'}</p></section>
    {earlier.length > 0 && <section className="panel"><h2>Earlier summaries</h2>{earlier.map(entry => <details key={entry.id}><summary>{when(entry.created_at)} · {entry.author_name}</summary><p className="care-text">{entry.body}</p>{entry.precautions && <p className="care-text">{entry.precautions}</p>}</details>)}</section>}</>
}

export function FollowUpQueue({ patients }: { patients: Patient[] }) {
  const queries = useQueries({ queries: patients.map(patient => ({ queryKey: ['care', patient.id], queryFn: () => api.care(patient.id) })) })
  const tasks = patients.flatMap((patient, index) => (queries[index]?.data ?? []).filter(entry => entry.kind === 'follow_up' && !entry.completed_at).map(entry => ({ patient, entry })))
    .sort((a, b) => (a.entry.due_date ?? '').localeCompare(b.entry.due_date ?? ''))
  return <section className="panel"><div className="section-title"><div><span className="eyebrow">CARE TEAM TASKS</span><h2>Follow-up queue</h2></div></div>
    {queries.some(query => query.isLoading) ? <SkeletonBlock variant="row" count={2} /> : queries.some(query => query.isError) ? <ErrorState message="Some follow-ups could not be loaded." retry={() => queries.filter(query => query.isError).forEach(query => { void query.refetch() })} /> : tasks.length ? <ul className="care-entries">{tasks.map(({ patient, entry }) => <li key={entry.id}><Link to={`/doctor/patients/${patient.id}`}>{patient.display_name}</Link><p className="care-text">{entry.body}</p><small>Due {entry.due_date} · Owner: {entry.author_name}</small></li>)}</ul> : <EmptyState title="No open follow-ups" body="Follow-up tasks from assigned patient records appear here by due date." />}
  </section>
}

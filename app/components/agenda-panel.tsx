'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type Appointment = { id: string; patient_id: string; starts_at: string; ends_at: string; status: string };
type Patient = { id: string; full_name: string };
const statuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled'];

async function callApi(path: string, options: RequestInit = {}) {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('Entre novamente para acessar a agenda.');
  const response = await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001') + path, {
    ...options,
    headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro ao consultar agenda.');
  return data;
}

export default function AgendaPanel() {
  const [day, setDay] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const from = new Date(day + 'T00:00:00');
      const to = new Date(from.getTime() + 86400000);
      const [a, p] = await Promise.all([
        callApi('/appointments?from=' + encodeURIComponent(from.toISOString()) + '&to=' + encodeURIComponent(to.toISOString())),
        callApi('/patients'),
      ]);
      setAppointments(a.appointments || []);
      setPatients(p.patients || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [day]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await callApi('/appointments', {
        method: 'POST',
        body: JSON.stringify({ patient_id: patientId, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() }),
      });
      setStart('');
      setEnd('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao agendar.');
    }
  }

  async function changeStatus(id: string, status: string) {
    try {
      await callApi('/appointments/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar.');
    }
  }

  return <section className="module-screen" aria-label="Agenda de atendimentos">
    <div className="panel-heading"><div><span className="eyebrow">AGENDA</span><h2>Atendimentos</h2><p>Horários no fuso local do dispositivo.</p></div></div>
    <div className="panel"><label htmlFor="agenda-date">Data </label><input id="agenda-date" type="date" value={day} onChange={e => setDay(e.target.value)} /></div>
    {error && <p role="alert" className="panel notice">{error}</p>}
    <div className="panel"><h3>Agenda do dia</h3>
      {loading ? <p>Carregando…</p> : appointments.length === 0 ? <p>Nenhum atendimento neste dia.</p> :
        <ul>{appointments.map(item => <li key={item.id}>
          <strong>{new Date(item.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
          {' — '}{patients.find(p => p.id === item.patient_id)?.full_name || 'Paciente'}
          <label> Status <select value={item.status} onChange={e => void changeStatus(item.id, e.target.value)}>
            {statuses.map(status => <option value={status} key={status}>{status}</option>)}
          </select></label>
        </li>)}</ul>}
    </div>
    <form className="panel" onSubmit={e => void create(e)}>
      <h3>Novo atendimento</h3>
      <label>Paciente <select required value={patientId} onChange={e => setPatientId(e.target.value)}>
        <option value="">Selecione</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}
      </select></label>
      <label>Início <input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>Fim <input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button type="submit" disabled={!patientId || !start || !end || new Date(end) <= new Date(start)}>Agendar</button>
    </form>
  </section>;
}

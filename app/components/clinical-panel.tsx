'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type Patient = { id: string; full_name: string };
type Encounter = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  status: 'in_progress' | 'completed';
  started_at: string;
  completed_at: string | null;
};
type Evolution = {
  id: string;
  content: string;
  status: 'draft' | 'confirmed';
  created_at: string;
  confirmed_at: string | null;
  author_id: string;
};
type Exercise = { id: string; title: string; instructions: string | null; created_at: string };
type Protocol = { id: string; title: string; description: string | null };

async function clinicalApi<T>(organizationId: string, path: string, options: RequestInit = {}): Promise<T> {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('Entre novamente para acessar os dados clínicos.');

  const headers = new Headers(options.headers);
  headers.set('Authorization', 'Bearer ' + session.access_token);
  headers.set('Content-Type', 'application/json');
  headers.set('X-FisioZap-Organization-Id', organizationId);

  const response = await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001') + path, {
    ...options,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível carregar os dados clínicos.');
  return body as T;
}

export default function ClinicalPanel({
  organizationId,
  patientId: initialPatientId,
  patientName: initialPatientName,
  appointmentId,
  initialEncounterId,
  onClose,
}: {
  organizationId: string;
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  initialEncounterId?: string;
  onClose?: () => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState(initialPatientId || '');
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [encounterId, setEncounterId] = useState(initialEncounterId || '');
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [availableProtocols, setAvailableProtocols] = useState<Protocol[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [content, setContent] = useState('');
  const [editingEvolutionId, setEditingEvolutionId] = useState('');
  const [reviewEvolutionId, setReviewEvolutionId] = useState('');
  const [exerciseTitle, setExerciseTitle] = useState('');
  const [exerciseInstructions, setExerciseInstructions] = useState('');
  const [selectedProtocolId, setSelectedProtocolId] = useState('');

  const loadEncounterDetails = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const [evolutionData, exerciseData, linkedProtocolData, protocolData] = await Promise.all([
        clinicalApi<{ evolutions: Evolution[] }>(organizationId, '/encounters/' + id + '/evolutions'),
        clinicalApi<{ exercises: Exercise[] }>(organizationId, '/encounters/' + id + '/exercises'),
        clinicalApi<{ protocols: Protocol[] }>(organizationId, '/encounters/' + id + '/protocols'),
        clinicalApi<{ protocols: Protocol[] }>(organizationId, '/protocols'),
      ]);
      setEvolutions(evolutionData.evolutions || []);
      setExercises(exerciseData.exercises || []);
      setProtocols(linkedProtocolData.protocols || []);
      setAvailableProtocols(protocolData.protocols || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o atendimento.');
    } finally {
      setDetailLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!patientId) {
      setEncounters([]);
      setEncounterId('');
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setError('');
    clinicalApi<{ encounters: Encounter[] }>(organizationId, '/encounters?patient_id=' + encodeURIComponent(patientId))
      .then(({ encounters: rows }) => {
        if (cancelled) return;
        const history = rows || [];
        setEncounters(history);
        if (initialEncounterId && history.some(item => item.id === initialEncounterId)) {
          setEncounterId(initialEncounterId);
        } else if (appointmentId) {
          const matching = history.find(item => item.appointment_id === appointmentId);
          setEncounterId(matching?.id || '');
        } else {
          setEncounterId('');
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [organizationId, patientId, appointmentId, initialEncounterId]);

  useEffect(() => {
    if (encounterId) void loadEncounterDetails(encounterId);
    else {
      setEvolutions([]);
      setExercises([]);
      setProtocols([]);
      setAvailableProtocols([]);
    }
  }, [encounterId, loadEncounterDetails]);

  useEffect(() => {
    if (initialPatientId) return;
    let cancelled = false;
    clinicalApi<{ patients: Patient[] }>(organizationId, '/patients')
      .then(({ patients: rows }) => { if (!cancelled) setPatients(rows || []); })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar pacientes.'); });
    return () => { cancelled = true; };
  }, [initialPatientId, organizationId]);

  async function refreshHistory() {
    if (!patientId) return;
    const { encounters: rows } = await clinicalApi<{ encounters: Encounter[] }>(
      organizationId,
      '/encounters?patient_id=' + encodeURIComponent(patientId),
    );
    setEncounters(rows || []);
  }

  async function startEncounter() {
    if (!patientId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await clinicalApi<{ encounter: Encounter }>(organizationId, '/encounters', {
        method: 'POST',
        body: JSON.stringify({ patient_id: patientId, appointment_id: appointmentId || null }),
      });
      setEncounterId(result.encounter.id);
      await refreshHistory();
      setNotice('Atendimento iniciado. As informações ainda não confirmadas podem ser revisadas.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o atendimento.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEvolution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!encounterId || !content.trim() || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingEvolutionId) {
        await clinicalApi(organizationId, '/evolutions/' + editingEvolutionId, {
          method: 'PATCH',
          body: JSON.stringify({ content: content.trim() }),
        });
        setNotice('Rascunho atualizado.');
      } else {
        await clinicalApi(organizationId, '/encounters/' + encounterId + '/evolutions', {
          method: 'POST',
          body: JSON.stringify({ content: content.trim() }),
        });
        setNotice('Rascunho salvo. Revise antes de confirmar.');
      }
      setContent('');
      setEditingEvolutionId('');
      await loadEncounterDetails(encounterId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a evolução.');
    } finally {
      setSaving(false);
    }
  }

  function editEvolution(evolution: Evolution) {
    setEditingEvolutionId(evolution.id);
    setContent(evolution.content);
    setReviewEvolutionId('');
  }

  async function confirmEvolution(id: string) {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await clinicalApi(organizationId, '/evolutions/' + id + '/confirm', { method: 'PATCH', body: '{}' });
      setReviewEvolutionId('');
      setNotice('Evolução confirmada e bloqueada para edição.');
      if (encounterId) await loadEncounterDetails(encounterId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a evolução.');
    } finally {
      setSaving(false);
    }
  }

  async function completeEncounter() {
    if (!encounterId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await clinicalApi(organizationId, '/encounters/' + encounterId + '/complete', { method: 'PATCH', body: '{}' });
      await refreshHistory();
      await loadEncounterDetails(encounterId);
      setNotice('Atendimento finalizado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível finalizar o atendimento.');
    } finally {
      setSaving(false);
    }
  }

  async function addExercise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!encounterId || !exerciseTitle.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await clinicalApi(organizationId, '/encounters/' + encounterId + '/exercises', {
        method: 'POST',
        body: JSON.stringify({ title: exerciseTitle.trim(), instructions: exerciseInstructions.trim() || null }),
      });
      setExerciseTitle('');
      setExerciseInstructions('');
      await loadEncounterDetails(encounterId);
      setNotice('Exercício registrado no atendimento.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o exercício.');
    } finally {
      setSaving(false);
    }
  }

  async function removeExercise(id: string) {
    if (saving || !window.confirm('Remover este exercício do atendimento?')) return;
    setSaving(true);
    setError('');
    try {
      await clinicalApi(organizationId, '/exercises/' + id, { method: 'DELETE' });
      await loadEncounterDetails(encounterId);
      setNotice('Exercício removido.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover o exercício.');
    } finally {
      setSaving(false);
    }
  }

  async function addProtocol(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!encounterId || !selectedProtocolId || saving) return;
    setSaving(true);
    setError('');
    try {
      await clinicalApi(organizationId, '/encounters/' + encounterId + '/protocols', {
        method: 'POST',
        body: JSON.stringify({ protocol_id: selectedProtocolId }),
      });
      setSelectedProtocolId('');
      await loadEncounterDetails(encounterId);
      setNotice('Protocolo associado ao atendimento.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível associar o protocolo.');
    } finally {
      setSaving(false);
    }
  }

  async function removeProtocol(id: string) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await clinicalApi(organizationId, '/encounters/' + encounterId + '/protocols', {
        method: 'DELETE',
        body: JSON.stringify({ protocol_id: id }),
      });
      await loadEncounterDetails(encounterId);
      setNotice('Protocolo removido do atendimento.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover o protocolo.');
    } finally {
      setSaving(false);
    }
  }

  const patientName = initialPatientName || patients.find(item => item.id === patientId)?.full_name || 'Paciente';
  const selectedEncounter = encounters.find(item => item.id === encounterId);
  const linkedProtocolIds = new Set(protocols.map(item => item.id));
  const unlinkedProtocols = availableProtocols.filter(item => !linkedProtocolIds.has(item.id));
  const drafts = evolutions.filter(item => item.status === 'draft');

  return <section className="clinical-panel module-screen" aria-label="Atendimento, evolução e histórico">
    <div className="panel-heading">
      <div><span className="eyebrow">PRONTUÁRIO</span><h2>Atendimento e histórico</h2><p>Revise os registros antes de confirmar. Evoluções confirmadas ficam bloqueadas para edição.</p></div>
      {onClose && <button type="button" className="back-button" onClick={onClose}>← Voltar à agenda</button>}
    </div>

    {!initialPatientId && <div className="panel">
      <label htmlFor="clinical-patient">Paciente</label>
      <select id="clinical-patient" value={patientId} onChange={event => { setPatientId(event.target.value); setEncounterId(''); }}>
        <option value="">Selecione um paciente</option>
        {patients.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}
      </select>
    </div>}

    {error && <div className="panel clinical-error" role="alert"><strong>Não foi possível concluir</strong><p>{error}</p></div>}
    {notice && <div className="panel clinical-notice" role="status">{notice}</div>}

    {patientId && <div className="clinical-layout">
      <aside className="panel clinical-history" aria-label="Histórico do paciente">
        <div className="clinical-section-heading"><div><h3>Histórico de {patientName}</h3><p>Atendimentos mais recentes primeiro.</p></div></div>
        {historyLoading ? <p role="status">Carregando histórico…</p> : encounters.length === 0
          ? <p>Nenhum atendimento registrado.</p>
          : <ul className="clinical-timeline">{encounters.map(item => <li key={item.id}>
            <button type="button" className={item.id === encounterId ? 'clinical-timeline-item selected' : 'clinical-timeline-item'} onClick={() => { setEncounterId(item.id); setReviewEvolutionId(''); setContent(''); setEditingEvolutionId(''); }}>
              <strong>{new Date(item.started_at).toLocaleString('pt-BR')}</strong>
              <span>{item.status === 'in_progress' ? 'Em andamento' : 'Finalizado'}</span>
            </button>
          </li>)}</ul>}
        {!encounterId && <button type="button" className="clinical-primary" onClick={() => void startEncounter()} disabled={saving || historyLoading}>
          {saving ? 'Iniciando…' : appointmentId ? 'Iniciar atendimento deste agendamento' : 'Iniciar novo atendimento'}
        </button>}
      </aside>

      <div className="clinical-record">
        {!encounterId ? <div className="panel clinical-empty"><h3>Selecione um atendimento</h3><p>Abra um item do histórico ou inicie um atendimento para registrar a evolução.</p></div>
          : detailLoading ? <div className="panel" role="status">Carregando prontuário…</div>
          : selectedEncounter ? <div className="panel">
            <div className="clinical-section-heading"><div><span className="eyebrow">ATENDIMENTO</span><h3>{patientName}</h3><p>{new Date(selectedEncounter.started_at).toLocaleString('pt-BR')} · {selectedEncounter.status === 'in_progress' ? 'Em andamento' : 'Finalizado'}</p></div>
              {selectedEncounter.status === 'in_progress' && <button type="button" className="clinical-secondary" onClick={() => void completeEncounter()} disabled={saving || drafts.length > 0} title={drafts.length ? 'Confirme os rascunhos antes de finalizar.' : undefined}>{saving ? 'Salvando…' : 'Finalizar atendimento'}</button>}
            </div>

            <section className="clinical-section" aria-labelledby="evolution-heading">
              <h4 id="evolution-heading">Evoluções</h4>
              {evolutions.length === 0 ? <p>Nenhuma evolução neste atendimento.</p> : <div className="clinical-list">{evolutions.map(item => <article className="clinical-entry" key={item.id}>
                <div className="clinical-entry-head"><strong>{item.status === 'draft' ? 'Rascunho' : 'Confirmada'}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('pt-BR')}</time></div>
                <p className="clinical-content">{item.content}</p>
                {item.status === 'draft' && selectedEncounter.status === 'in_progress' && <div className="clinical-actions">
                  <button type="button" className="clinical-secondary" onClick={() => editEvolution(item)} disabled={saving}>Editar rascunho</button>
                  <button type="button" className="clinical-primary" onClick={() => setReviewEvolutionId(item.id)} disabled={saving}>Revisar e confirmar</button>
                </div>}
                {reviewEvolutionId === item.id && <div className="clinical-review" role="group" aria-label="Revisão da evolução">
                  <strong>Confirme que revisou este registro</strong><p>{item.content}</p>
                  <div className="clinical-actions"><button type="button" className="clinical-primary" onClick={() => void confirmEvolution(item.id)} disabled={saving}>{saving ? 'Confirmando…' : 'Confirmar evolução'}</button><button type="button" className="clinical-secondary" onClick={() => setReviewEvolutionId('')} disabled={saving}>Voltar</button></div>
                </div>}
              </article>)}</div>}

              {selectedEncounter.status === 'in_progress' && <form className="clinical-form" onSubmit={event => void saveEvolution(event)}>
                <label htmlFor="evolution-content">{editingEvolutionId ? 'Editar evolução em rascunho' : 'Nova evolução em rascunho'}</label>
                <textarea id="evolution-content" rows={6} maxLength={10000} required value={content} onChange={event => setContent(event.target.value)} placeholder="Registre a evolução clínica para revisão antes da confirmação." />
                <div className="clinical-actions"><button type="submit" className="clinical-primary" disabled={saving || !content.trim()}>{saving ? 'Salvando…' : editingEvolutionId ? 'Salvar rascunho' : 'Salvar rascunho'}</button>{editingEvolutionId && <button type="button" className="clinical-secondary" onClick={() => { setEditingEvolutionId(''); setContent(''); }} disabled={saving}>Cancelar edição</button>}</div>
              </form>}
            </section>

            <section className="clinical-section" aria-labelledby="exercise-heading">
              <h4 id="exercise-heading">Exercícios prescritos</h4>
              {exercises.length === 0 ? <p>Nenhum exercício registrado.</p> : <ul className="clinical-resource-list">{exercises.map(item => <li key={item.id}><div><strong>{item.title}</strong>{item.instructions && <p>{item.instructions}</p>}</div>{selectedEncounter.status === 'in_progress' && <button type="button" className="clinical-secondary" onClick={() => void removeExercise(item.id)} disabled={saving}>Remover</button>}</li>)}</ul>}
              {selectedEncounter.status === 'in_progress' && <form className="clinical-form" onSubmit={event => void addExercise(event)}>
                <label htmlFor="exercise-title">Adicionar exercício</label><input id="exercise-title" required maxLength={200} value={exerciseTitle} onChange={event => setExerciseTitle(event.target.value)} placeholder="Nome do exercício" />
                <label htmlFor="exercise-instructions">Instruções</label><textarea id="exercise-instructions" rows={3} maxLength={4000} value={exerciseInstructions} onChange={event => setExerciseInstructions(event.target.value)} placeholder="Séries, repetições ou orientações" />
                <button type="submit" className="clinical-primary" disabled={saving || !exerciseTitle.trim()}>{saving ? 'Salvando…' : 'Registrar exercício'}</button>
              </form>}
            </section>

            <section className="clinical-section" aria-labelledby="protocol-heading">
              <h4 id="protocol-heading">Protocolos</h4>
              {protocols.length === 0 ? <p>Nenhum protocolo associado.</p> : <ul className="clinical-resource-list">{protocols.map(item => <li key={item.id}><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div>{selectedEncounter.status === 'in_progress' && <button type="button" className="clinical-secondary" onClick={() => void removeProtocol(item.id)} disabled={saving}>Remover</button>}</li>)}</ul>}
              {selectedEncounter.status === 'in_progress' && <form className="clinical-form clinical-inline-form" onSubmit={event => void addProtocol(event)}>
                <label htmlFor="protocol-select">Associar protocolo</label>
                <select id="protocol-select" value={selectedProtocolId} onChange={event => setSelectedProtocolId(event.target.value)}>
                  <option value="">Selecione um protocolo</option>{unlinkedProtocols.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                <button type="submit" className="clinical-primary" disabled={saving || !selectedProtocolId}>Associar</button>
              </form>}
            </section>
          </div> : <div className="panel" role="status">Atendimento não encontrado no histórico deste paciente.</div>}
      </div>
    </div>}
  </section>;
}

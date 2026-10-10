'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type FinancialEntry = {
  id: string;
  patient_id: string | null;
  kind: 'income' | 'expense';
  amount_cents: number;
  description: string;
  occurred_at: string;
  due_date: string | null;
  paid_at: string | null;
};
type PatientOption = { id: string; full_name: string };
type Summary = { income: { paid_cents: number; pending_cents: number }; expense: { paid_cents: number; pending_cents: number } };
type LedgerResponse = { month: string; entries: FinancialEntry[]; summary: Summary };

const emptySummary: Summary = {
  income: { paid_cents: 0, pending_cents: 0 },
  expense: { paid_cents: 0, pending_cents: 0 },
};
const maxAmountCents = 999_999_999_999;

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localMonth() {
  return localDate().slice(0, 7);
}

function amountInputCents(value: string): number | null {
  const match = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= maxAmountCents ? cents : null;
}

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function dateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day, 12));
}

async function financeApi<T>(organizationId: string, path: string, options: RequestInit = {}): Promise<T> {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('Entre novamente para acessar o financeiro.');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  headers.set('X-FisioZap-Organization-Id', organizationId);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível atualizar o financeiro.');
  return body as T;
}

export default function FinancialPanel({ organizationId }: { organizationId: string }) {
  const [month, setMonth] = useState(localMonth);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [kind, setKind] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(localDate);
  const [dueDate, setDueDate] = useState('');
  const [patientId, setPatientId] = useState('');
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const [dataContext, setDataContext] = useState({ organizationId, month });
  const currentView = useRef({ organizationId, month });
  currentView.current = { organizationId, month };
  const hasCurrentData = dataContext.organizationId === organizationId && dataContext.month === month;

  const isCurrentView = useCallback((context: { organizationId: string; month: string }) => {
    return currentView.current.organizationId === context.organizationId && currentView.current.month === context.month;
  }, []);

  const refresh = useCallback(async () => {
    const context = { organizationId, month };
    if (!isCurrentView(context)) return;
    const id = ++requestId.current;
    setDataContext({ organizationId: '', month: '' });
    setLoading(true);
    setError('');
    try {
      const [ledger, patientOptions] = await Promise.all([
        financeApi<LedgerResponse>(organizationId, `/financial-entries?month=${encodeURIComponent(month)}`),
        financeApi<{ patients: PatientOption[] }>(organizationId, '/financial-entries/patient-options'),
      ]);
      if (id !== requestId.current || !isCurrentView(context)) return;
      setEntries(ledger.entries || []);
      setSummary(ledger.summary || emptySummary);
      setPatients(patientOptions.patients || []);
      setDataContext(context);
    } catch (cause) {
      if (id === requestId.current && isCurrentView(context)) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o livro-caixa.');
    } finally {
      if (id === requestId.current && isCurrentView(context)) setLoading(false);
    }
  }, [isCurrentView, month, organizationId]);

  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]);

  async function createEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const context = { organizationId, month };
    const amountCents = amountInputCents(amount);
    if (amountCents === null) {
      setError('Informe um valor positivo com até duas casas decimais.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await financeApi<{ entry: FinancialEntry }>(organizationId, '/financial-entries', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          amount_cents: amountCents,
          description,
          occurred_at: occurredAt,
          due_date: dueDate || null,
          patient_id: patientId || null,
          paid,
        }),
      });
      if (!isCurrentView(context)) return;
      setAmount('');
      setDescription('');
      setDueDate('');
      setPatientId('');
      setPaid(false);
      const entryMonth = occurredAt.slice(0, 7);
      if (entryMonth !== month) setMonth(entryMonth);
      else await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o lançamento.');
    } finally {
      setSaving(false);
    }
  }

  async function changePayment(entry: FinancialEntry) {
    const context = { organizationId, month };
    setUpdatingId(entry.id);
    setError('');
    try {
      await financeApi<{ entry: FinancialEntry }>(organizationId, `/financial-entries/${entry.id}/payment`, {
        method: 'PATCH',
        body: JSON.stringify({ paid: !entry.paid_at }),
      });
      if (!isCurrentView(context)) return;
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o pagamento.');
    } finally {
      setUpdatingId('');
    }
  }

  return <section className="module-screen financial-screen" aria-label="Livro-caixa">
    <div className="panel-heading">
      <div><span className="eyebrow">FINANCEIRO</span><h2>Livro-caixa</h2><p>Receitas, despesas e pagamentos por mês.</p></div>
      <label className="financial-month">Mês <input aria-label="Mês do livro-caixa" type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
    </div>

    {error && <div className="panel clinical-error" role="alert"><strong>Não foi possível concluir</strong><p>{error}</p></div>}

    <div className="financial-summary" aria-label="Resumo financeiro do mês" aria-live="polite">
      <article className="panel financial-total"><span>Receitas recebidas</span><strong>{!hasCurrentData || loading ? '—' : money(summary.income.paid_cents)}</strong><small>{!hasCurrentData || loading ? 'Atualizando período…' : 'Valores pagos'}</small></article>
      <article className="panel financial-total"><span>A receber</span><strong>{!hasCurrentData || loading ? '—' : money(summary.income.pending_cents)}</strong><small>{!hasCurrentData || loading ? 'Atualizando período…' : 'Receitas pendentes'}</small></article>
      <article className="panel financial-total"><span>Despesas pagas</span><strong>{!hasCurrentData || loading ? '—' : money(summary.expense.paid_cents)}</strong><small>{!hasCurrentData || loading ? 'Atualizando período…' : 'Valores pagos'}</small></article>
      <article className="panel financial-total"><span>A pagar</span><strong>{!hasCurrentData || loading ? '—' : money(summary.expense.pending_cents)}</strong><small>{!hasCurrentData || loading ? 'Atualizando período…' : 'Despesas pendentes'}</small></article>
    </div>

    <form className="panel financial-form" onSubmit={event => void createEntry(event)}>
      <div className="financial-form-heading"><div><span className="eyebrow">NOVO REGISTRO</span><h3>Adicionar ao livro-caixa</h3></div></div>
      <div className="financial-fields">
        <label>Tipo
          <select value={kind} onChange={event => setKind(event.target.value as 'income' | 'expense')}>
            <option value="income">Receita</option><option value="expense">Despesa</option>
          </select>
        </label>
        <label>Valor em reais
          <input required inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="finance-amount-help" />
          <small id="finance-amount-help">Use até duas casas decimais. Ex.: 125,50</small>
        </label>
        <label className="financial-description">Descrição
          <input required minLength={2} maxLength={120} value={description} onChange={event => setDescription(event.target.value)} />
        </label>
        <label>Data do lançamento
          <input required type="date" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} />
        </label>
        <label>Vencimento <span className="muted">(opcional)</span>
          <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />
        </label>
        <label>Paciente <span className="muted">(opcional)</span>
          <select value={patientId} onChange={event => setPatientId(event.target.value)}>
            <option value="">Sem paciente associado</option>
            {(hasCurrentData ? patients : []).map(patient => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}
          </select>
        </label>
      </div>
      <label className="financial-paid-toggle"><input type="checkbox" checked={paid} onChange={event => setPaid(event.target.checked)} /> Já foi pago</label>
      <button className="clinical-primary financial-submit" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Registrar lançamento'}</button>
    </form>

    <section className="panel financial-list-panel" aria-labelledby="financial-list-title">
      <div className="financial-list-heading"><div><span className="eyebrow">MOVIMENTAÇÕES</span><h3 id="financial-list-title">Lançamentos de {month}</h3></div><span className="count">{hasCurrentData ? entries.length : '—'}</span></div>
      {loading || !hasCurrentData ? <p role="status">Carregando lançamentos…</p> : entries.length === 0 ?
        <p className="financial-empty">Nenhum lançamento neste mês. Use o formulário para registrar a primeira movimentação.</p> :
        <ul className="financial-list">
          {entries.map(entry => {
            const patient = (hasCurrentData ? patients : []).find(option => option.id === entry.patient_id);
            const isPaid = Boolean(entry.paid_at);
            return <li className="financial-entry" key={entry.id}>
              <div className="financial-entry-main">
                <span className={`financial-kind ${entry.kind}`}>{entry.kind === 'income' ? 'Receita' : 'Despesa'}</span>
                <strong>{entry.description}</strong>
                {patient && <span className="financial-patient">Paciente: {patient.full_name}</span>}
                <span className="financial-dates">Lançado em {dateLabel(entry.occurred_at)}{entry.due_date ? ` · vence ${dateLabel(entry.due_date)}` : ''}</span>
              </div>
              <div className="financial-entry-amount">
                <strong>{money(entry.amount_cents)}</strong>
                <span className={isPaid ? 'financial-state paid' : 'financial-state pending'}>{isPaid ? 'Pago' : 'Pendente'}</span>
                <button type="button" className="clinical-secondary" onClick={() => void changePayment(entry)} disabled={updatingId === entry.id}>
                  {updatingId === entry.id ? 'Atualizando…' : isPaid ? 'Marcar pendente' : 'Marcar pago'}
                </button>
              </div>
            </li>;
          })}
        </ul>}
    </section>
  </section>;
}

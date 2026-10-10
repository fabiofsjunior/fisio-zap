'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type Notification = {
  id: string;
  title: string;
  message: string | null;
  priority: 'urgent' | 'attention' | 'informational';
  status: 'unread' | 'read' | 'completed' | 'dismissed';
  action_data: { due_at?: string };
  created_at: string;
};

type Filter = 'open' | 'completed' | 'all';

async function notificationRequest<T>(organizationId: string, path: string, options: RequestInit = {}): Promise<T> {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('Entre novamente para acessar suas tarefas.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  headers.set('X-FisioZap-Organization-Id', organizationId);
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível acessar as tarefas.');
  return data as T;
}

export default function NotificationsPanel({ organizationId }: { organizationId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Notification['priority']>('informational');
  const [dueAt, setDueAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await notificationRequest<{ notifications: Notification[] }>(organizationId, '/notifications');
      setItems(result.notifications || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar as tarefas.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleItems = useMemo(() => items.filter(item => {
    if (filter === 'completed') return item.status === 'completed' || item.status === 'dismissed';
    if (filter === 'open') return item.status === 'unread' || item.status === 'read';
    return true;
  }), [filter, items]);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || title.trim().length < 2) return;
    setSaving(true);
    setError('');
    try {
      await notificationRequest(organizationId, '/notifications', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), message: message.trim(), priority, due_at: dueAt ? new Date(dueAt).toISOString() : null }),
      });
      setTitle(''); setMessage(''); setPriority('informational'); setDueAt('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a tarefa.');
    } finally { setSaving(false); }
  }

  async function updateStatus(item: Notification, status: Notification['status']) {
    setError('');
    try {
      const result = await notificationRequest<{ notification: Notification }>(organizationId, `/notifications/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      setItems(current => current.map(row => row.id === item.id ? result.notification : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a tarefa.');
    }
  }

  async function remove(item: Notification) {
    setError('');
    try {
      await notificationRequest(organizationId, `/notifications/${item.id}`, { method: 'DELETE' });
      setItems(current => current.filter(row => row.id !== item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a tarefa.');
    }
  }

  const openCount = items.filter(item => item.status === 'unread' || item.status === 'read').length;
  return <section className="module-screen" aria-label="Central de tarefas e lembretes">
    <div className="panel-heading"><div><span className="eyebrow">Notificações · S5</span><h2>Tarefas e lembretes</h2><p>Organize suas pendências pessoais em um só lugar.</p></div><span className="count" aria-label={`${openCount} tarefas abertas`}>{openCount} abertas</span></div>
    <div className="panel notification-privacy"><strong>Uso operacional</strong><p>Registre tarefas e lembretes sem incluir dados clínicos, informações de pacientes ou valores financeiros.</p></div>
    {error && <div className="panel notice" role="alert"><p>{error}</p></div>}
    <form className="panel notification-form" onSubmit={event => void createTask(event)}>
      <h3>Nova tarefa</h3>
      <label>Título<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} minLength={2} required placeholder="Ex.: confirmar horário" /></label>
      <label>Detalhes <span className="muted">(opcional)</span><textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={1000} rows={3} placeholder="Lembrete operacional" /></label>
      <div className="notification-fields">
        <label>Prioridade<select value={priority} onChange={event => setPriority(event.target.value as Notification['priority'])}><option value="informational">Informativa</option><option value="attention">Atenção</option><option value="urgent">Urgente</option></select></label>
        <label>Vencimento <span className="muted">(opcional)</span><input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
      </div>
      <button type="submit" disabled={saving || title.trim().length < 2}>{saving ? 'Salvando…' : 'Adicionar tarefa'}</button>
    </form>
    <div className="panel notification-list">
      <div className="notification-list-heading"><h3>Suas tarefas</h3><label>Exibir<select aria-label="Filtrar tarefas" value={filter} onChange={event => setFilter(event.target.value as Filter)}><option value="open">Abertas</option><option value="completed">Concluídas e descartadas</option><option value="all">Todas</option></select></label></div>
      {loading ? <p role="status">Carregando tarefas…</p> : visibleItems.length === 0 ? <p className="empty-notifications">{filter === 'completed' ? 'Nenhuma tarefa concluída ainda.' : 'Tudo em dia. Adicione um lembrete quando precisar.'}</p> : <ul className="notification-items">
        {visibleItems.map(item => <li className={`notification-item priority-${item.priority}`} key={item.id}>
          <div className="notification-copy"><span className="notification-meta">{item.priority === 'urgent' ? 'Urgente' : item.priority === 'attention' ? 'Atenção' : 'Informativa'}</span><strong>{item.title}</strong>{item.message && <p>{item.message}</p>}{item.action_data?.due_at && <time className="notification-due" dateTime={item.action_data.due_at}>Vence {new Date(item.action_data.due_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>}</div>
          <div className="notification-actions">
            {item.status === 'unread' && <button type="button" className="secondary-button" onClick={() => void updateStatus(item, 'read')}>Marcar como lida</button>}
            {(item.status === 'unread' || item.status === 'read') && <button type="button" onClick={() => void updateStatus(item, 'completed')}>Concluir</button>}
            {item.status === 'completed' || item.status === 'dismissed' ? <span className="completed-label">{item.status === 'completed' ? 'Concluída' : 'Descartada'}</span> : <button type="button" className="text-button" aria-label={`Excluir ${item.title}`} onClick={() => void remove(item)}>Excluir</button>}
          </div>
        </li>)}
      </ul>}
    </div>
  </section>;
}

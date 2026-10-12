'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type TeamRole = 'owner' | 'coordinator' | 'professional' | 'administrative';
type TeamMember = { user_id: string; display_name: string; role: TeamRole };
type TeamState = {
  organizationId: string;
  status: 'loading' | 'ready' | 'empty' | 'error' | 'denied';
  members: TeamMember[];
  nextCursor: string | null;
  canManageRoles: boolean;
  loadingMore: boolean;
  pageError: string;
};
type EditableRole = Exclude<TeamRole, 'owner'>;

const roleLabels: Record<TeamRole, string> = {
  owner: 'Proprietário',
  coordinator: 'Coordenador(a)',
  professional: 'Profissional',
  administrative: 'Administrativo(a)',
};

export function parseTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) throw new Error('Resposta inválida da equipe.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Resposta inválida da equipe.');
    const member = entry as Record<string, unknown>;
    if (typeof member.user_id !== 'string' || !member.user_id || typeof member.display_name !== 'string' || !member.display_name.trim()
      || typeof member.role !== 'string' || !Object.hasOwn(roleLabels, member.role)) throw new Error('Resposta inválida da equipe.');
    return { user_id: member.user_id, display_name: member.display_name.trim(), role: member.role as TeamRole };
  });
}

function parseTeamPage(value: unknown): { members: TeamMember[]; nextCursor: string | null; canManageRoles: boolean } {
  if (!value || typeof value !== 'object') throw new Error('Resposta inválida da equipe.');
  const body = value as Record<string, unknown>;
  const nextCursor = body.next_cursor;
  if (nextCursor !== null && (typeof nextCursor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nextCursor))) {
    throw new Error('Resposta inválida da equipe.');
  }
  if (typeof body.can_manage_roles !== 'boolean') throw new Error('Resposta inválida da equipe.');
  return { members: parseTeamMembers(body.members), nextCursor, canManageRoles: body.can_manage_roles };
}

async function browserAccessToken() {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  return session?.access_token ?? null;
}

const emptyState = (organizationId: string, status: TeamState['status']): TeamState => ({
  organizationId, status, members: [], nextCursor: null, canManageRoles: false, loadingMore: false, pageError: '',
});

export default function TeamDirectoryPanel({ organizationId, role = 'coordinator', getAccessToken = browserAccessToken }: { organizationId: string; role?: 'owner' | 'coordinator' | 'professional' | 'administrative'; getAccessToken?: () => Promise<string | null> }) {
  const [state, setState] = useState<TeamState>(() => emptyState(organizationId, 'loading'));
  const [refreshKey, setRefreshKey] = useState(0);
  const [draftRoles, setDraftRoles] = useState<Record<string, EditableRole>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const pageRequestRef = useRef<AbortController | null>(null);
  const pageLockRef = useRef(false);
  const saveLockRef = useRef<{ generation: number; userId: string } | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const currentOrganizationRef = useRef(organizationId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      requestRef.current?.abort();
      pageRequestRef.current?.abort();
      requestRef.current = null;
      pageRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (role !== 'owner') {
      setDraftRoles({});
      setConfirmUserId(null);
      setEditError('');
      setSavingUserId(null);
    }
  }, [role]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    requestRef.current?.abort();
    pageRequestRef.current?.abort();
    pageLockRef.current = false;
    if (saveLockRef.current?.generation !== generation) saveLockRef.current = null;
    requestRef.current = controller;
    if (currentOrganizationRef.current !== organizationId) {
      currentOrganizationRef.current = organizationId;
      setDraftRoles({});
      setConfirmUserId(null);
      setEditError('');
      setSavingUserId(null);
    }
    setState(emptyState(organizationId, 'loading'));
    const isCurrent = () => mountedRef.current && !controller.signal.aborted && generationRef.current === generation;

    void (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Sessão ausente');
        if (!isCurrent()) return;
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/team/members?limit=50`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}`, 'X-FisioZap-Organization-Id': organizationId },
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (response.status === 403) {
          setState(emptyState(organizationId, 'denied'));
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (!isCurrent()) return;
        if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível carregar a equipe.');
        const page = parseTeamPage(body);
        if (isCurrent()) setState({ ...emptyState(organizationId, page.members.length ? 'ready' : 'empty'), ...page });
      } catch {
        if (isCurrent()) setState(emptyState(organizationId, 'error'));
      }
    })();

    return () => {
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [organizationId, getAccessToken, refreshKey]);

  const loadMore = async () => {
    const current = state;
    const cursor = current.nextCursor;
    const generation = generationRef.current;
    if (!cursor || current.organizationId !== organizationId || current.status !== 'ready' || pageLockRef.current) return;
    pageLockRef.current = true;
    const controller = new AbortController();
    pageRequestRef.current = controller;
    setState((previous) => previous.organizationId === organizationId ? { ...previous, loadingMore: true, pageError: '' } : previous);
    const isCurrent = () => mountedRef.current && !controller.signal.aborted && generationRef.current === generation && currentOrganizationRef.current === organizationId;
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Sessão ausente');
      if (!isCurrent()) return;
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/team/members?limit=50&cursor=${encodeURIComponent(cursor)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, 'X-FisioZap-Organization-Id': organizationId },
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      const body = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível carregar mais pessoas.');
      const page = parseTeamPage(body);
      if (!isCurrent()) return;
      setState((previous) => {
        if (previous.organizationId !== organizationId) return previous;
        const knownIds = new Set(previous.members.map((member) => member.user_id));
        const appended = page.members.filter((member) => {
          if (knownIds.has(member.user_id)) return false;
          knownIds.add(member.user_id);
          return true;
        });
        return {
          ...previous,
          status: 'ready',
          members: [...previous.members, ...appended],
          nextCursor: page.nextCursor,
          canManageRoles: page.canManageRoles,
          loadingMore: false,
          pageError: '',
        };
      });
    } catch {
      if (isCurrent()) setState((previous) => previous.organizationId === organizationId ? { ...previous, loadingMore: false, pageError: 'Não foi possível carregar mais pessoas. Tente novamente.' } : previous);
    } finally {
      if (pageRequestRef.current === controller) pageRequestRef.current = null;
      if (generationRef.current === generation) pageLockRef.current = false;
    }
  };

  const updateRole = async (member: TeamMember) => {
    const nextRole = draftRoles[member.user_id];
    if (role !== 'owner' || !state.canManageRoles || member.role === 'owner' || !nextRole || nextRole === member.role) return;
    if (confirmUserId !== member.user_id) { setConfirmUserId(member.user_id); setEditError(''); return; }
    const generation = generationRef.current;
    if (saveLockRef.current) return;
    const scopeId = organizationId;
    saveLockRef.current = { generation, userId: member.user_id };
    setSavingUserId(member.user_id);
    setEditError('');
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Sessão ausente');
      if (!mountedRef.current || generationRef.current !== generation) return;
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/team/members/${encodeURIComponent(member.user_id)}/role`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'X-FisioZap-Organization-Id': scopeId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!mountedRef.current || generationRef.current !== generation) return;
      const body = await response.json().catch(() => ({}));
      if (!mountedRef.current || generationRef.current !== generation) return;
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível atualizar a função.');
      if (body?.member?.user_id !== member.user_id || body?.member?.role !== nextRole) throw new Error('Resposta inválida ao atualizar a função.');
      setDraftRoles({});
      setConfirmUserId(null);
      setEditError('');
      setRefreshKey((key) => key + 1);
    } catch {
      if (mountedRef.current && generationRef.current === generation) setEditError('Não foi possível atualizar a função. Tente novamente.');
    } finally {
      if (saveLockRef.current?.generation === generation && saveLockRef.current.userId === member.user_id) saveLockRef.current = null;
      if (mountedRef.current && generationRef.current === generation) setSavingUserId(null);
    }
  };

  const currentState = state.organizationId === organizationId ? state : emptyState(organizationId, 'loading');
  return <TeamDirectoryView state={currentState} canEditRoles={role === 'owner' && currentState.canManageRoles} draftRoles={draftRoles} savingUserId={savingUserId} confirmUserId={confirmUserId} editError={editError}
    onRoleChange={(userId, nextRole) => setDraftRoles((drafts) => ({ ...drafts, [userId]: nextRole }))}
    onCancelEdit={(userId) => { setDraftRoles((drafts) => { const updated = { ...drafts }; delete updated[userId]; return updated; }); setConfirmUserId(null); setEditError(''); }}
    onLoadMore={loadMore} onSaveRole={updateRole} />;
}

export function TeamDirectoryView({ state, canEditRoles = false, draftRoles = {}, savingUserId = null, confirmUserId = null, editError = '', onRoleChange, onCancelEdit, onLoadMore, onSaveRole }: {
  state: Pick<TeamState, 'status' | 'members'> & Partial<Pick<TeamState, 'nextCursor' | 'loadingMore' | 'pageError'>>; canEditRoles?: boolean; draftRoles?: Record<string, EditableRole>; savingUserId?: string | null; confirmUserId?: string | null; editError?: string;
  onRoleChange?: (userId: string, role: EditableRole) => void; onCancelEdit?: (userId: string) => void; onLoadMore?: () => void; onSaveRole?: (member: TeamMember) => void;
}) {
  const hasMore = Boolean(state.nextCursor);
  return <section className="team-directory panel" aria-label="Equipe">
    <div className="team-directory-heading">
      <div><span className="eyebrow">ORGANIZAÇÃO</span><h2>Equipe</h2><p>Profissionais e funções nesta organização.</p></div>
      {state.status === 'ready' && <span className="team-count">{hasMore ? `${state.members.length} ${state.members.length === 1 ? 'pessoa carregada' : 'pessoas carregadas'}` : `${state.members.length} ${state.members.length === 1 ? 'pessoa' : 'pessoas'}`}</span>}
    </div>
    {state.status === 'loading' && <p className="team-state" role="status">Carregando equipe…</p>}
    {state.status === 'empty' && <div className="team-state"><strong>Nenhuma pessoa cadastrada</strong><span>A equipe desta organização ainda não tem membros.</span></div>}
    {state.status === 'error' && <p className="team-state team-state-error" role="alert">Não foi possível carregar a equipe. Tente novamente mais tarde.</p>}
    {state.status === 'denied' && <p className="team-state" role="status">Seu perfil não tem acesso à lista da equipe.</p>}
    {editError && <p className="team-state team-state-error" role="alert">{editError}</p>}
    {state.status === 'ready' && <>
      <ul className="team-list">{state.members.map((member) => <li className="team-member" key={member.user_id}>
        <span className="team-avatar" aria-hidden="true">{member.display_name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span>
        <span className="team-member-details"><strong>{member.display_name}</strong><span>{roleLabels[draftRoles[member.user_id] ?? member.role]}</span></span>
        {canEditRoles && member.role !== 'owner' && <div className="team-role-edit"><label htmlFor={`team-role-${member.user_id}`}>Função</label><select id={`team-role-${member.user_id}`} aria-label={`Função de ${member.display_name}`} value={draftRoles[member.user_id] ?? member.role} disabled={savingUserId === member.user_id || confirmUserId === member.user_id} onChange={(event) => onRoleChange?.(member.user_id, event.target.value as EditableRole)}><option value="professional">Profissional</option><option value="coordinator">Coordenador(a)</option><option value="administrative">Administrativo(a)</option></select>
          {draftRoles[member.user_id] && draftRoles[member.user_id] !== member.role && <>{confirmUserId === member.user_id && <span role="status">Alterar função para {roleLabels[draftRoles[member.user_id]]}?</span>}<button type="button" disabled={savingUserId === member.user_id} onClick={() => onSaveRole?.(member)}>{savingUserId === member.user_id ? 'Salvando…' : confirmUserId === member.user_id ? 'Confirmar alteração' : 'Salvar'}</button><button type="button" disabled={savingUserId === member.user_id} onClick={() => onCancelEdit?.(member.user_id)}>Cancelar</button></>}
        </div>}
      </li>)}</ul>
      {state.pageError && <p className="team-state team-state-error team-page-error" role="alert">{state.pageError}</p>}
      {hasMore && <div className="team-load-more"><button type="button" aria-busy={state.loadingMore} disabled={state.loadingMore} onClick={onLoadMore}>{state.loadingMore ? 'Carregando…' : state.pageError ? 'Tentar novamente' : 'Carregar mais'}</button></div>}
    </>}
    <p className="team-privacy-note">{canEditRoles ? 'Proprietário pode atualizar funções. Dados de contato não são exibidos.' : 'Lista somente para consulta. Dados de contato não são exibidos.'}</p>
  </section>;
}

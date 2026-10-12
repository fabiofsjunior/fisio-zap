'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type TeamRole = 'owner' | 'coordinator' | 'professional' | 'administrative';
type TeamMember = { user_id: string; display_name: string; role: TeamRole };
type TeamState = { organizationId: string; status: 'loading' | 'ready' | 'empty' | 'error' | 'denied'; members: TeamMember[] };
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

async function browserAccessToken() {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  return session?.access_token ?? null;
}

export default function TeamDirectoryPanel({ organizationId, role = 'coordinator', getAccessToken = browserAccessToken }: { organizationId: string; role?: 'owner' | 'coordinator' | 'professional' | 'administrative'; getAccessToken?: () => Promise<string | null> }) {
  const [state, setState] = useState<TeamState>({ organizationId, status: 'loading', members: [] });
  const [refreshKey, setRefreshKey] = useState(0);
  const [draftRoles, setDraftRoles] = useState<Record<string, EditableRole>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const currentOrganizationRef = useRef(organizationId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      requestRef.current?.abort();
      requestRef.current = null;
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
    requestRef.current = controller;
    if (currentOrganizationRef.current !== organizationId) {
      currentOrganizationRef.current = organizationId;
      setDraftRoles({});
      setConfirmUserId(null);
      setEditError('');
      setSavingUserId(null);
    }
    setState({ organizationId, status: 'loading', members: [] });
    const isCurrent = () => mountedRef.current && !controller.signal.aborted && generationRef.current === generation;

    void (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Sessão ausente');
        if (!isCurrent()) return;
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/team/members`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-FisioZap-Organization-Id': organizationId,
          },
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (response.status === 403) {
          setState({ organizationId, status: 'denied', members: [] });
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível carregar a equipe.');
        const members = parseTeamMembers(body?.members);
        if (isCurrent()) setState({ organizationId, status: members.length ? 'ready' : 'empty', members });
      } catch {
        if (isCurrent()) setState({ organizationId, status: 'error', members: [] });
      }
    })();

    return () => {
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [organizationId, getAccessToken, refreshKey]);

  const updateRole = async (member: TeamMember) => {
    const nextRole = draftRoles[member.user_id];
    if (role !== 'owner' || member.role === 'owner' || !nextRole || nextRole === member.role) return;
    if (confirmUserId !== member.user_id) { setConfirmUserId(member.user_id); setEditError(''); return; }
    const generation = generationRef.current;
    const scopeId = organizationId;
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
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível atualizar a função.');
      if (body?.member?.user_id !== member.user_id || body?.member?.role !== nextRole) throw new Error('Resposta inválida ao atualizar a função.');
      setDraftRoles((drafts) => { const updated = { ...drafts }; delete updated[member.user_id]; return updated; });
      setConfirmUserId(null);
      setRefreshKey((key) => key + 1);
    } catch {
      if (mountedRef.current && generationRef.current === generation) setEditError('Não foi possível atualizar a função. Tente novamente.');
    } finally {
      if (mountedRef.current && generationRef.current === generation) setSavingUserId(null);
    }
  };

  const currentState = state.organizationId === organizationId ? state : { organizationId, status: 'loading' as const, members: [] };
  return <TeamDirectoryView state={currentState} canEditRoles={role === 'owner'} draftRoles={draftRoles} savingUserId={savingUserId} confirmUserId={confirmUserId} editError={editError}
    onRoleChange={(userId, nextRole) => setDraftRoles((drafts) => ({ ...drafts, [userId]: nextRole }))}
    onCancelEdit={(userId) => { setDraftRoles((drafts) => { const updated = { ...drafts }; delete updated[userId]; return updated; }); setConfirmUserId(null); setEditError(''); }}
    onSaveRole={updateRole} />;
}

export function TeamDirectoryView({ state, canEditRoles = false, draftRoles = {}, savingUserId = null, confirmUserId = null, editError = '', onRoleChange, onCancelEdit, onSaveRole }: {
  state: Pick<TeamState, 'status' | 'members'>; canEditRoles?: boolean; draftRoles?: Record<string, EditableRole>; savingUserId?: string | null; confirmUserId?: string | null; editError?: string;
  onRoleChange?: (userId: string, role: EditableRole) => void; onCancelEdit?: (userId: string) => void; onSaveRole?: (member: TeamMember) => void;
}) {
  return <section className="team-directory panel" aria-label="Equipe">
    <div className="team-directory-heading">
      <div><span className="eyebrow">ORGANIZAÇÃO</span><h2>Equipe</h2><p>Profissionais e funções nesta organização.</p></div>
      {state.status === 'ready' && <span className="team-count">{state.members.length === 200 ? 'Até 200 pessoas' : `${state.members.length} ${state.members.length === 1 ? 'pessoa' : 'pessoas'}`}</span>}
    </div>
    {state.status === 'loading' && <p className="team-state" role="status">Carregando equipe…</p>}
    {state.status === 'empty' && <div className="team-state"><strong>Nenhuma pessoa cadastrada</strong><span>A equipe desta organização ainda não tem membros.</span></div>}
    {state.status === 'error' && <p className="team-state team-state-error" role="alert">Não foi possível carregar a equipe. Tente novamente mais tarde.</p>}
    {state.status === 'denied' && <p className="team-state" role="status">Seu perfil não tem acesso à lista da equipe.</p>}
    {editError && <p className="team-state team-state-error" role="alert">{editError}</p>}
    {state.status === 'ready' && <ul className="team-list">{state.members.map((member) => <li className="team-member" key={member.user_id}>
      <span className="team-avatar" aria-hidden="true">{member.display_name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span>
      <span className="team-member-details"><strong>{member.display_name}</strong><span>{roleLabels[draftRoles[member.user_id] ?? member.role]}</span></span>
      {canEditRoles && member.role !== 'owner' && <div className="team-role-edit"><label htmlFor={`team-role-${member.user_id}`}>Função</label><select id={`team-role-${member.user_id}`} aria-label={`Função de ${member.display_name}`} value={draftRoles[member.user_id] ?? member.role} disabled={savingUserId === member.user_id || confirmUserId === member.user_id} onChange={(event) => onRoleChange?.(member.user_id, event.target.value as EditableRole)}><option value="professional">Profissional</option><option value="coordinator">Coordenador(a)</option><option value="administrative">Administrativo(a)</option></select>
        {draftRoles[member.user_id] && draftRoles[member.user_id] !== member.role && <>{confirmUserId === member.user_id && <span role="status">Alterar função para {roleLabels[draftRoles[member.user_id]]}?</span>}<button type="button" disabled={savingUserId === member.user_id} onClick={() => onSaveRole?.(member)}>{savingUserId === member.user_id ? 'Salvando…' : confirmUserId === member.user_id ? 'Confirmar alteração' : 'Salvar'}</button><button type="button" disabled={savingUserId === member.user_id} onClick={() => onCancelEdit?.(member.user_id)}>Cancelar</button></>}
      </div>}
    </li>)}</ul>}
    <p className="team-privacy-note">{canEditRoles ? 'Proprietário pode atualizar funções. Dados de contato não são exibidos.' : 'Lista somente para consulta. Dados de contato não são exibidos.'}</p>
  </section>;
}

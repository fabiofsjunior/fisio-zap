'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type TeamRole = 'owner' | 'coordinator' | 'professional' | 'administrative';
type TeamMember = { user_id: string; display_name: string; role: TeamRole };
type TeamState = { organizationId: string; status: 'loading' | 'ready' | 'empty' | 'error' | 'denied'; members: TeamMember[] };

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

export default function TeamDirectoryPanel({ organizationId, getAccessToken = browserAccessToken }: { organizationId: string; getAccessToken?: () => Promise<string | null> }) {
  const [state, setState] = useState<TeamState>({ organizationId, status: 'loading', members: [] });
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);

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
    const controller = new AbortController();
    const generation = ++generationRef.current;
    requestRef.current?.abort();
    requestRef.current = controller;
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
  }, [organizationId, getAccessToken]);

  const currentState = state.organizationId === organizationId ? state : { organizationId, status: 'loading' as const, members: [] };
  return <TeamDirectoryView state={currentState} />;
}

export function TeamDirectoryView({ state }: { state: Pick<TeamState, 'status' | 'members'> }) {
  return <section className="team-directory panel" aria-label="Equipe">
    <div className="team-directory-heading">
      <div><span className="eyebrow">ORGANIZAÇÃO</span><h2>Equipe</h2><p>Profissionais e funções nesta organização.</p></div>
      {state.status === 'ready' && <span className="team-count">{state.members.length === 200 ? 'Até 200 pessoas' : `${state.members.length} ${state.members.length === 1 ? 'pessoa' : 'pessoas'}`}</span>}
    </div>
    {state.status === 'loading' && <p className="team-state" role="status">Carregando equipe…</p>}
    {state.status === 'empty' && <div className="team-state"><strong>Nenhuma pessoa cadastrada</strong><span>A equipe desta organização ainda não tem membros.</span></div>}
    {state.status === 'error' && <p className="team-state team-state-error" role="alert">Não foi possível carregar a equipe. Tente novamente mais tarde.</p>}
    {state.status === 'denied' && <p className="team-state" role="status">Seu perfil não tem acesso à lista da equipe.</p>}
    {state.status === 'ready' && <ul className="team-list">{state.members.map((member) => <li className="team-member" key={member.user_id}>
      <span className="team-avatar" aria-hidden="true">{member.display_name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span>
      <span className="team-member-details"><strong>{member.display_name}</strong><span>{roleLabels[member.role]}</span></span>
    </li>)}</ul>}
    <p className="team-privacy-note">Lista somente para consulta. Dados de contato não são exibidos.</p>
  </section>;
}

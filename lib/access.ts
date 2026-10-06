import { createSupabaseServerClient } from '@/lib/supabase/server';

export type FisioRole = 'owner' | 'professional' | 'coordinator' | 'administrative';

export const ROLE_MODULES: Record<FisioRole, string[]> = {
  owner: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro'],
  coordinator: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro'],
  professional: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações'],
  administrative: ['Minha rotina', 'Agenda', 'Notificações', 'Financeiro'],
};

export async function getCurrentMembership() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    user,
    organizationId: data.organization_id as string,
    role: data.role as FisioRole,
  };
}

export function allowedModules(role: FisioRole) {
  return ROLE_MODULES[role] ?? [];
}

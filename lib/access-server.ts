import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { FisioRole } from '@/lib/access';

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

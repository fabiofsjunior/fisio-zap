import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function randomPart(length = 8) {
  return crypto.randomUUID().replaceAll('-', '').slice(0, length);
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (!currentUser) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership || membership.role !== 'owner') return NextResponse.json({ error: 'Apenas o proprietário pode criar usuários de teste.' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'Supabase administrativo não configurado.' }, { status: 500 });

  const suffix = randomPart();
  const email = `usuarioparatestes${suffix}@fisiozap.local`;
  const password = `Teste!${randomPart(10)}aA1`;
  const adminDb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const created = await adminDb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Usuário para testes ${suffix}` } });
  if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message || 'Não foi possível criar o usuário.' }, { status: 500 });

  const { error: memberError } = await adminDb.from('organization_members').upsert(
    { organization_id: membership.organization_id, user_id: created.data.user.id, role: 'professional' },
    { onConflict: 'organization_id,user_id' },
  );

  if (memberError) {
    await adminDb.auth.admin.deleteUser(created.data.user.id);
    return NextResponse.json({ error: 'Usuário criado, mas não foi possível vinculá-lo à organização.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user: { email, password, role: 'professional' }, warning: 'Guarde esta credencial para o teste no navegador. A senha não será exibida novamente.' });
}

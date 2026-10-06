import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Apenas o proprietário pode executar os testes.' }, { status: 403 });
  }

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  const startedAt = Date.now();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return NextResponse.json({ error: 'Sessão ativa sem token de acesso.' }, { status: 401 });

  const healthResponse = await fetch(`${backendUrl}/health`, { cache: 'no-store' });
  if (!healthResponse.ok) return NextResponse.json({ error: `Backend /health respondeu HTTP ${healthResponse.status}.` }, { status: 502 });

  const chatResponse = await fetch(`${backendUrl}/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'teste interno FisioZap' }),
    cache: 'no-store',
  });
  const chatBody = await chatResponse.json().catch(() => ({}));
  if (!chatResponse.ok) return NextResponse.json({ error: `Backend /chat respondeu HTTP ${chatResponse.status}: ${chatBody.error || 'erro desconhecido'}` }, { status: 502 });

  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!adminKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ error: 'Supabase administrativo não configurado.' }, { status: 500 });
  const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, adminKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: userCheckError } = await adminDb.auth.admin.getUserById(user.id);
  if (userCheckError) return NextResponse.json({ error: 'Validação administrativa do usuário falhou.' }, { status: 502 });

  return NextResponse.json({ ok: true, checks: { session: 'OK', backendHealth: 'OK', backendAuth: 'OK', adminAuth: 'OK' }, latencyMs: Date.now() - startedAt });
}

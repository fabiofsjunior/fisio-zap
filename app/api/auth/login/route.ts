import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('[FisioZap auth] Supabase público não configurado no processo Next.js.');
      return NextResponse.json({ error: 'Supabase não está configurado no servidor local.' }, { status: 500 });
    }

    const cookieStore = await cookies();
    const response = NextResponse.json({ ok: true });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const invalidCredentials = error.code === 'invalid_credentials' || error.message === 'Invalid login credentials';
      const confirmationRequired = error.code === 'email_not_confirmed';
      console.error('[FisioZap auth] Login recusado ou indisponível.', {
        status: error.status,
        reason: invalidCredentials ? 'invalid_credentials' : confirmationRequired ? 'email_not_confirmed' : 'provider_unavailable',
      });

      return NextResponse.json(
        {
          error:
            invalidCredentials
              ? 'E-mail ou senha inválidos.'
              : confirmationRequired
                ? 'Confirme o e-mail da conta no Supabase de homologação antes de entrar.'
              : 'Não foi possível entrar. Verifique a configuração do Supabase e tente novamente.',
        },
        { status: invalidCredentials || confirmationRequired ? 401 : 503 },
      );
    }

    return response;
  } catch {
    console.error('[FisioZap auth] Erro inesperado ao processar o login.');
    return NextResponse.json({ error: 'Não foi possível processar o login.' }, { status: 500 });
  }
}

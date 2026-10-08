import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

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
      console.error('[FisioZap auth] signInWithPassword falhou:', {
        email,
        message: error.message,
        status: error.status,
        code: error.code,
      });

      return NextResponse.json(
        {
          error:
            error.message === 'Invalid login credentials'
              ? 'E-mail ou senha inválidos.'
              : 'Não foi possível entrar. Verifique a configuração do Supabase e tente novamente.',
        },
        { status: 401 },
      );
    }

    return response;
  } catch (error) {
    console.error('[FisioZap auth] erro inesperado no login:', error);
    return NextResponse.json({ error: 'Não foi possível processar o login.' }, { status: 500 });
  }
}

'use client';

import { FormEvent, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'E-mail ou senha inválidos.'
          : 'Não foi possível entrar. Verifique a configuração do Supabase e tente novamente.',
      );
      setLoading(false);
      return;
    }

    // Refreshes the server components so proxy/page.tsx can observe the new auth cookies.
    window.location.assign('/');
  }

  return (
    <main className="shell">
      <section className="panel" style={{ maxWidth: 520, margin: '80px auto' }}>
        <span className="eyebrow">FISIOZAP</span>
        <h2>Entrar</h2>
        <form onSubmit={submit}>
          <input
            aria-label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Seu e-mail"
          />
          <input
            aria-label="Senha"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Sua senha"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}

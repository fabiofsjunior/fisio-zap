'use client';

import { FormEvent, useState } from 'react';

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

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error || 'Não foi possível entrar. Tente novamente.');
        setLoading(false);
        return;
      }

      window.location.assign('/');
    } catch {
      setError('Não foi possível conectar ao servidor local. Verifique se o FisioZap está em execução.');
      setLoading(false);
    }
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

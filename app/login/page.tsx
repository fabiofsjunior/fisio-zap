'use client';

import { FormEvent, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setLoading(true); setError(''); const supabase=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); const {error}=await supabase.auth.signInWithPassword({email,password}); if(error){setError('Não foi possível entrar. Verifique suas credenciais.');setLoading(false);return;} window.location.href='/'; }
  return <main className="shell"><section className="panel" style={{maxWidth:520,margin:'80px auto'}}><span className="eyebrow">FISIOZAP</span><h2>Entrar</h2><form onSubmit={submit}><input aria-label="E-mail" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Seu e-mail"/><input aria-label="Senha" type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha"/><button type="submit" disabled={loading}>{loading?'Entrando…':'Entrar'}</button>{error&&<p role="alert">{error}</p>}</form></section></main>;
}

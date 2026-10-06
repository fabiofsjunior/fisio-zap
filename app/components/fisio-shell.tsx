'use client';

import { useState } from 'react';
import { ROLE_MODULES, type FisioRole } from '@/lib/access';
import { createBrowserClient } from '@supabase/ssr';

type Message = { id: number; role: 'user' | 'assistant'; text: string; mode?: 'demo' };

const modules = [
  ['📅', 'Minha rotina', 'Atendimentos e próximos compromissos.'],
  ['👥', 'Pacientes', 'Cadastro e acompanhamento.'],
  ['🗓️', 'Agenda', 'Organização da agenda profissional.'],
  ['📝', 'Evoluções', 'Registros clínicos após confirmação.'],
  ['🧠', 'Exercícios e protocolos', 'Seu método e materiais próprios.'],
  ['🔔', 'Notificações', 'Pendências e pontos de atenção.'],
  ['💰', 'Financeiro', 'Entradas e despesas.'],
];

export default function FisioShell({ email, role }: { email: string | null; role: FisioRole }) {
  const visibleModules = modules.filter(([, title]) => ROLE_MODULES[role].includes(title));
  const [tab, setTab] = useState<'chat' | 'panel'>('chat');
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    const optimistic: Message = { id: Date.now(), role: 'user', text };
    setMessages((current) => [...current, optimistic]);
    setDraft('');

    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão ausente');

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message: text }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível falar com o assistente.');

      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: 'assistant', text: payload.message, mode: payload.mode },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function logout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const active = visibleModules.find(([, title]) => title === activeModule);

  function openModule(title: string) {
    setActiveModule(title);
    setTab('panel');
  }

  function renderModuleScreen() {
    if (!active) return null;
    const [, title, description] = active;
    const actions: Record<string, string[]> = {
      'Minha rotina': ['Ver agenda de hoje', 'Registrar pendência'],
      Pacientes: ['Novo paciente', 'Pesquisar pacientes'],
      Agenda: ['Novo atendimento', 'Ver semana'],
      Evoluções: ['Nova evolução', 'Revisar pendências'],
      'Exercícios e protocolos': ['Novo exercício', 'Novo protocolo'],
      Notificações: ['Ver pendências', 'Marcar como lida'],
      Financeiro: ['Nova entrada', 'Nova despesa'],
    };
    return (
      <section className="module-screen">
        <button type="button" className="back-button" onClick={() => setActiveModule(null)}>← Voltar ao painel</button>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">MÓDULO</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <span className="demo-badge">Disponível no perfil {role}</span>
        </div>
        <div className="module-actions">
          {(actions[title] ?? ['Novo registro']).map((action) => (
            <button key={action} type="button" className="action-card">
              <strong>{action}</strong>
              <span>Próximo ciclo</span>
            </button>
          ))}
        </div>
        <div className="panel empty-module">
          <strong>{title} está pronto para receber os dados reais.</strong>
          <p>Esta tela já faz parte da jornada autenticada. A próxima implementação conecta as ações ao Supabase com as regras de acesso do seu perfil.</p>
        </div>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">FISIOZAP</span>
          <h1>{tab === 'chat' ? 'Assistente' : 'Painel'}</h1>
        </div>
        <div className="account">
          <span title={email ?? undefined}>{email ?? 'Profissional autenticado'} · {role}</span>
          <button type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      {tab === 'chat' ? (
        <section className="chat-panel" aria-label="Chat do FisioZap">
          <div className="chat-intro">
            <span className="eyebrow">CONVERSA INTERNA</span>
            <h2>Como posso ajudar hoje?</h2>
            <p>Este primeiro ciclo usa uma resposta de demonstração. Nenhum dado clínico é gravado.</p>
          </div>

          <div className="messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="empty-state">
                <strong>Comece uma conversa</strong>
                <span>Ex.: “O que preciso organizar hoje?”</span>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <span>{message.text}</span>
                {message.mode === 'demo' && <small>Resposta de demonstração</small>}
              </div>
            ))}
            {sending && <div className="message assistant">Pensando…</div>}
          </div>

          {error && (
            <div className="chat-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')}>Fechar</button>
            </div>
          )}

          <div className="composer">
            <textarea
              aria-label="Mensagem para o assistente"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Digite uma mensagem…"
              maxLength={4000}
              rows={2}
            />
            <button type="button" onClick={() => void sendMessage()} disabled={!draft.trim() || sending}>
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </section>
      ) : activeModule ? (
        renderModuleScreen()
      ) : (
        <section>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CENTRAL DO PROFISSIONAL</span>
              <h2>Seu trabalho em um só lugar</h2>
            </div>
            <span className="demo-badge">Perfil: {role}</span>
          </div>
          <div className="module-grid">
            {visibleModules.map(([icon, title, description]) => (
              <article className="module-card" key={title}>
                <span className="module-icon">{icon}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <small>Em preparação</small>
              </article>
            ))}
          </div>
          <div className="panel notice">
            <strong>Privacidade primeiro</strong>
            <p>Seu perfil controla quais módulos aparecem. Dados clínicos só entram quando identidade, organização, profissional e autorização estiverem validados.</p>
          </div>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Navegação principal">
        <button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
          <span>💬</span>Chat
        </button>
        <button type="button" className={tab === 'panel' ? 'active' : ''} onClick={() => setTab('panel')}>
          <span>▦</span>Painel
        </button>
      </nav>
    </main>
  );
}

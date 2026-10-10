'use client';

import { useState } from 'react';
import { ROLE_MODULES, type FisioRole } from '@/lib/access';
import { createBrowserClient } from '@supabase/ssr';
import PatientsPanel from '@/app/components/patients-panel';
import AgendaPanel from '@/app/components/agenda-panel';
import ClinicalPanel from '@/app/components/clinical-panel';
import NotificationsPanel from '@/app/components/notifications-panel';
import FinancialPanel from '@/app/components/financial-panel';

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

export default function FisioShell({ email, role, organizationId, userId }: { email: string | null; role: FisioRole; organizationId: string; userId: string }) {
  const visibleModules = modules.filter(([, title]) => ROLE_MODULES[role].includes(title));
  const canManageClinicalRecords = role === 'owner' || role === 'coordinator';
  const [tab, setTab] = useState<'chat' | 'panel' | 'tests'>('chat');
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testUser, setTestUser] = useState<{ email: string; password: string; role: string } | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setError('');
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text }]); setDraft('');
    try {
      const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão ausente');
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: text }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível falar com o assistente.');
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: payload.message, mode: payload.mode }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally { setSending(false); }
  }

  async function logout() {
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await client.auth.signOut(); window.location.href = '/login';
  }

  async function runSmokeTest() {
    setTestLoading(true); setTestResult(''); setTestUser(null);
    try {
      const response = await fetch('/api/test/diagnostics', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Smoke test falhou.');
      setTestResult(`SMOKE TEST OK — sessão, Supabase, Next.js, backend, autenticação do /chat e acesso administrativo validados em ${body.latencyMs} ms.`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Smoke test falhou.');
    } finally { setTestLoading(false); }
  }

  async function createTestUser() {
    setCreateLoading(true); setTestUser(null); setTestResult('');
    try {
      const response = await fetch('/api/test/users', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível criar o usuário de teste.');
      setTestUser(body.user);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Não foi possível criar o usuário de teste.');
    } finally { setCreateLoading(false); }
  }

  const openTests = () => { setTab('tests'); setActiveModule(null); };
  const active = visibleModules.find(([, title]) => title === activeModule);
  function openModule(title: string) { setActiveModule(title); setTab('panel'); }

  function renderModuleScreen() {
    if (!active) return null;
    if (activeModule === 'Agenda' || activeModule === 'Minha rotina') return <><button type="button" className="back-button" onClick={() => setActiveModule(null)}>← Voltar ao painel</button><AgendaPanel organizationId={organizationId} userId={userId} canManageClinicalRecords={canManageClinicalRecords} /></>;
    if (activeModule === 'Pacientes') return <><button type="button" className="back-button" onClick={() => setActiveModule(null)}>← Voltar ao painel</button><PatientsPanel /></>;
    if (activeModule === 'Notificações') return <><button type="button" className="back-button" onClick={() => setActiveModule(null)}>← Voltar ao painel</button><NotificationsPanel organizationId={organizationId} /></>;
    if (activeModule === 'Financeiro') return <><button type="button" className="back-button" onClick={() => setActiveModule(null)}>← Voltar ao painel</button><FinancialPanel organizationId={organizationId} /></>;
    if (activeModule === 'Evoluções' || activeModule === 'Exercícios e protocolos') return <ClinicalPanel organizationId={organizationId} userId={userId} canManageClinicalRecords={canManageClinicalRecords} onClose={() => setActiveModule(null)} />;
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
    return <section className="module-screen"><button type="button" className="back-button" onClick={() => setActiveModule(null)}>← Voltar ao painel</button><div className="panel-heading"><div><span className="eyebrow">MÓDULO</span><h2>{title}</h2><p>{description}</p></div><span className="demo-badge">Disponível no perfil {role}</span></div><div className="module-actions">{(actions[title] ?? ['Novo registro']).map((action) => <button key={action} type="button" className="action-card"><strong>{action}</strong><span>Próximo ciclo</span></button>)}</div><div className="panel empty-module"><strong>{title} está pronto para receber os dados reais.</strong><p>Esta tela já faz parte da jornada autenticada. A próxima implementação conecta as ações ao Supabase com as regras de acesso do seu perfil.</p></div></section>;
  }

  const testsScreen = <section className="module-screen"><button type="button" className="back-button" onClick={() => setTab('panel')}>← Voltar ao painel</button><div className="panel-heading"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h2>Central de testes</h2><p>Ferramentas para validar a aplicação e preparar usuários de teste.</p></div><span className="demo-badge">Somente owner</span></div><div className="module-actions"><button type="button" className="action-card" onClick={() => void runSmokeTest()} disabled={testLoading}><strong>{testLoading ? 'Executando…' : '🩺 Rodar smoke test'}</strong><span>Supabase → Next.js → backend → /chat</span></button><button type="button" className="action-card" onClick={() => void createTestUser()} disabled={createLoading}><strong>{createLoading ? 'Criando…' : '👤 Criar usuário de teste'}</strong><span>Gera e-mail e senha aleatórios</span></button><div className="panel notice"><strong>▶️ Front + Back</strong><p>O ambiente local é iniciado pelo comando <code>npm run dev</code>, que atualiza a branch atual com <code>git pull --ff-only</code>, inicia backend e frontend no mesmo terminal e abre o navegador.</p></div></div>{testResult && <div className="panel notice"><strong>Resultado</strong><p>{testResult}</p></div>}{testUser && <div className="panel notice"><strong>Credencial gerada</strong><p><strong>Usuário:</strong> {testUser.email}<br /><strong>Senha:</strong> {testUser.password}<br /><strong>Perfil:</strong> {testUser.role}</p><p>Use esta credencial no navegador em /login. A senha será exibida somente nesta sessão.</p></div>}</section>;

  return <main className="app-shell"><header className="app-header"><div><span className="eyebrow">FISIOZAP</span><h1>{tab === 'chat' ? 'Assistente' : tab === 'tests' ? 'Testes' : 'Painel'}</h1></div><div className="account"><span title={email ?? undefined}>{email ?? 'Profissional autenticado'} · {role}</span><button type="button" onClick={logout}>Sair</button></div></header>{tab === 'chat' ? <section className="chat-panel" aria-label="Chat do FisioZap"><div className="chat-intro"><span className="eyebrow">CONVERSA INTERNA</span><h2>Como posso ajudar hoje?</h2><p>Este primeiro ciclo usa uma resposta de demonstração. Nenhum dado clínico é gravado.</p></div><div className="messages" aria-live="polite">{messages.length === 0 && <div className="empty-state"><strong>Comece uma conversa</strong><span>Ex.: “O que preciso organizar hoje?”</span></div>}{messages.map((message) => <div key={message.id} className={`message ${message.role}`}><span>{message.text}</span>{message.mode === 'demo' && <small>Resposta de demonstração</small>}</div>)}{sending && <div className="message assistant">Pensando…</div>}</div>{error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>Fechar</button></div>}<div className="composer"><textarea aria-label="Mensagem para o assistente" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Digite uma mensagem…" maxLength={4000} rows={2} /><button type="button" onClick={() => void sendMessage()} disabled={!draft.trim() || sending}>{sending ? 'Enviando…' : 'Enviar'}</button></div></section> : tab === 'tests' ? testsScreen : activeModule ? renderModuleScreen() : <section><div className="panel-heading"><div><span className="eyebrow">CENTRAL DO PROFISSIONAL</span><h2>Seu trabalho em um só lugar</h2></div><span className="demo-badge">Perfil: {role}</span></div><div className="module-grid">{visibleModules.map(([icon, title, description]) => <button type="button" className="module-card" key={title} onClick={() => openModule(title)}><span className="module-icon">{icon}</span><h3>{title}</h3><p>{description}</p><small>Em preparação</small></button>)}{role === 'owner' && <button type="button" className="module-card" onClick={openTests}><span className="module-icon">🧪</span><h3>Testes</h3><p>Diagnóstico e usuários temporários para validar o ambiente.</p><small>Somente owner</small></button>}</div><div className="panel notice"><strong>Privacidade primeiro</strong><p>Seu perfil controla quais módulos aparecem. Dados clínicos só entram quando identidade, organização, profissional e autorização estiverem validados.</p></div></section>}<nav className="bottom-nav" aria-label="Navegação principal"><button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><span>💬</span>Chat</button><button type="button" className={tab === 'panel' ? 'active' : ''} onClick={() => { setTab('panel'); setActiveModule(null); }}><span>▦</span>Painel</button>{role === 'owner' && <button type="button" className={tab === 'tests' ? 'active' : ''} onClick={openTests}><span>🧪</span>Testes</button>}</nav></main>;
}

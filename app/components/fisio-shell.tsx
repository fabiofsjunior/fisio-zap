'use client';

import { useEffect, useRef, useState } from 'react';
import { ROLE_MODULES, type FisioRole } from '@/lib/access';
import { createBrowserClient } from '@supabase/ssr';
import PatientsPanel from '@/app/components/patients-panel';
import AgendaPanel from '@/app/components/agenda-panel';
import ClinicalPanel from '@/app/components/clinical-panel';
import NotificationsPanel from '@/app/components/notifications-panel';
import FinancialPanel from '@/app/components/financial-panel';
import ChatComposer, { formatChatFileSize, getChatFileMimeType } from '@/app/components/chat-composer';
import { getLocalDayRange } from '@/app/lib/agenda-date-range.mjs';

type MessageAttachment = { name: string; size: number; mime: string; kind: 'audio' | 'image' | 'document'; url: string };
type Message = { id: number; role: 'user' | 'assistant'; text: string; mode?: 'demo' | 'read_only' | 'attachment_receipt'; attachment?: MessageAttachment };

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_CONVERSATION_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const MAX_CONVERSATION_ATTACHMENTS = 10;

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
  const [sending, setSending] = useState(false);
  const [attachmentUsage, setAttachmentUsage] = useState({ bytes: 0, count: 0 });
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testUser, setTestUser] = useState<{ email: string; password: string; role: string } | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const mountedRef = useRef(false);
  const loggingOutRef = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const attachmentUrlsRef = useRef(new Set<string>());
  const attachmentUsageRef = useRef({ bytes: 0, count: 0 });
  const scopeRef = useRef({ organizationId, userId });
  const sessionScopeRef = useRef({ organizationId, userId });
  const [messageScope, setMessageScope] = useState({ organizationId, userId });
  scopeRef.current = { organizationId, userId };

  function clearConversationAttachments() {
    attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    attachmentUrlsRef.current.clear();
    attachmentUsageRef.current = { bytes: 0, count: 0 };
    setAttachmentUsage({ bytes: 0, count: 0 });
    setMessages([]);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      attachmentUrlsRef.current.clear();
      attachmentUsageRef.current = { bytes: 0, count: 0 };
    };
  }, []);

  useEffect(() => {
    const previousScope = sessionScopeRef.current;
    if (previousScope.organizationId !== organizationId || previousScope.userId !== userId) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setSending(false);
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      attachmentUrlsRef.current.clear();
      attachmentUsageRef.current = { bytes: 0, count: 0 };
      setAttachmentUsage({ bytes: 0, count: 0 });
      setMessages([]);
      setMessageScope({ organizationId, userId });
      setError('');
    }
    sessionScopeRef.current = { organizationId, userId };
  }, [organizationId, userId]);

  async function sendMessage(text: string, file?: File) {
    const messageText = text.trim();
    if ((!messageText && !file) || sending || loggingOutRef.current) return;
    if (messageText && file) throw new Error('Envie o texto e o arquivo em mensagens separadas.');

    const requestScope = { organizationId, userId };
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setSending(true); setError('');
    try {
      const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão ausente');
      if (controller.signal.aborted || !mountedRef.current || scopeRef.current.organizationId !== requestScope.organizationId || scopeRef.current.userId !== requestScope.userId) return;

      if (file) {
        const mime = getChatFileMimeType(file);
        if (!mime) throw new Error('Formato de arquivo não aceito. Escolha PDF, JPEG, PNG, WebP, WebM, Ogg, WAV, MP3 ou MP4.');
        if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error('Cada arquivo deve ter entre 1 byte e 10 MB.');
        if (attachmentUsageRef.current.count >= MAX_CONVERSATION_ATTACHMENTS) {
          throw new Error('Esta conversa já recebeu 10 arquivos. Inicie uma nova sessão para anexar outros.');
        }
        if (attachmentUsageRef.current.bytes + file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
          throw new Error('O limite total de arquivos desta conversa é 30 MB.');
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/chat/attachments`, {
          method: 'POST',
          headers: {
            'Content-Type': mime,
            Authorization: `Bearer ${session.access_token}`,
            'X-FisioZap-Organization-Id': organizationId,
            'X-FisioZap-File-Name': encodeURIComponent(file.name),
          },
          body: file,
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar o arquivo.');
        if (controller.signal.aborted || !mountedRef.current || loggingOutRef.current || scopeRef.current.organizationId !== requestScope.organizationId || scopeRef.current.userId !== requestScope.userId) return;

        const kind: MessageAttachment['kind'] = mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'image' : 'document';
        const receiptAttachment = payload?.attachment;
        const receiptIsValid = payload?.mode === 'attachment_receipt'
          && typeof payload.message === 'string' && payload.message.trim().length > 0
          && receiptAttachment && typeof receiptAttachment === 'object'
          && typeof receiptAttachment.id === 'string' && receiptAttachment.id.trim().length > 0
          && receiptAttachment.name === file.name
          && receiptAttachment.size === file.size
          && receiptAttachment.mime === mime
          && receiptAttachment.kind === kind;
        if (!receiptIsValid) throw new Error('O servidor não confirmou o recebimento do arquivo. Tente novamente.');

        let url = '';
        try {
          url = URL.createObjectURL(file);
          attachmentUrlsRef.current.add(url);
        } catch { /* The receipt and filename remain useful if local preview is unavailable. */ }
        attachmentUsageRef.current.bytes += file.size;
        attachmentUsageRef.current.count += 1;
        setAttachmentUsage({ ...attachmentUsageRef.current });
        const receipt = payload.message;
        const uploadedAttachment: MessageAttachment = { name: file.name, size: file.size, mime, kind, url };
        setMessages((current) => [
          ...current,
          { id: Date.now(), role: 'user', text: '', attachment: uploadedAttachment },
          { id: Date.now() + 1, role: 'assistant', text: receipt, mode: 'attachment_receipt' },
        ]);
        return;
      }

      const now = new Date();
      const localDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const { from, to } = getLocalDayRange(localDay);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'X-FisioZap-Organization-Id': organizationId,
        },
        body: JSON.stringify({ message: messageText, timezone, month: localDay.slice(0, 7), today_range: { from: from.toISOString(), to: to.toISOString() } }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível falar com o assistente.');
      if (controller.signal.aborted || !mountedRef.current || loggingOutRef.current || scopeRef.current.organizationId !== requestScope.organizationId || scopeRef.current.userId !== requestScope.userId) return;
      setMessages((current) => [
        ...current,
        { id: Date.now(), role: 'user', text: messageText },
        { id: Date.now() + 1, role: 'assistant', text: payload.message, mode: payload.mode },
      ]);
    } catch (err) {
      if (mountedRef.current && !loggingOutRef.current && scopeRef.current.organizationId === requestScope.organizationId && scopeRef.current.userId === requestScope.userId && !(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
        throw err;
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        if (mountedRef.current) setSending(false);
      }
    }
  }

  async function logout() {
    loggingOutRef.current = true;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    clearConversationAttachments();
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await client.auth.signOut(); window.location.href = '/login';
  }

  function renderMessageAttachment(attachment: MessageAttachment) {
    return <div className="chat-message-attachment">
      <div className="chat-message-file-details"><strong title={attachment.name}>{attachment.name}</strong><span>{formatChatFileSize(attachment.size)}</span></div>
      {attachment.kind === 'audio' && attachment.url && <audio controls preload="metadata" src={attachment.url} aria-label={`Áudio enviado: ${attachment.name}`} />}
      {(attachment.kind === 'document' || attachment.kind === 'image') && attachment.url && <a href={attachment.url} download={attachment.name}>Baixar {attachment.name}</a>}
      {!attachment.url && <small>{attachment.kind === 'image' ? 'Imagem recebida; prévia não disponível nesta sessão.' : 'Prévia local indisponível.'}</small>}
    </div>;
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

  const visibleMessages = messageScope.organizationId === organizationId && messageScope.userId === userId ? messages : [];

  const testsScreen = <section className="module-screen"><button type="button" className="back-button" onClick={() => setTab('panel')}>← Voltar ao painel</button><div className="panel-heading"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h2>Central de testes</h2><p>Ferramentas para validar a aplicação e preparar usuários de teste.</p></div><span className="demo-badge">Somente owner</span></div><div className="module-actions"><button type="button" className="action-card" onClick={() => void runSmokeTest()} disabled={testLoading}><strong>{testLoading ? 'Executando…' : '🩺 Rodar smoke test'}</strong><span>Supabase → Next.js → backend → /chat</span></button><button type="button" className="action-card" onClick={() => void createTestUser()} disabled={createLoading}><strong>{createLoading ? 'Criando…' : '👤 Criar usuário de teste'}</strong><span>Gera e-mail e senha aleatórios</span></button><div className="panel notice"><strong>▶️ Front + Back</strong><p>O ambiente local é iniciado pelo comando <code>npm run dev</code>, que atualiza a branch atual com <code>git pull --ff-only</code>, inicia backend e frontend no mesmo terminal e abre o navegador.</p></div></div>{testResult && <div className="panel notice"><strong>Resultado</strong><p>{testResult}</p></div>}{testUser && <div className="panel notice"><strong>Credencial gerada</strong><p><strong>Usuário:</strong> {testUser.email}<br /><strong>Senha:</strong> {testUser.password}<br /><strong>Perfil:</strong> {testUser.role}</p><p>Use esta credencial no navegador em /login. A senha será exibida somente nesta sessão.</p></div>}</section>;

  return <main className="app-shell"><header className="app-header"><div><span className="eyebrow">FISIOZAP</span><h1>{tab === 'chat' ? 'Assistente' : tab === 'tests' ? 'Testes' : 'Painel'}</h1></div><div className="account"><span title={email ?? undefined}>{email ?? 'Profissional autenticado'} · {role}</span><button type="button" onClick={logout}>Sair</button></div></header>{tab === 'chat' ? <section className="chat-panel" aria-label="Chat do FisioZap"><div className="chat-intro"><span className="eyebrow">ASSISTENTE OPERACIONAL</span><h2>Como posso ajudar hoje?</h2><p>Consulto sua agenda, suas pendências próprias e o resumo financeiro do mês. Respostas somente leitura, sem conteúdo clínico. Arquivos ficam disponíveis apenas nesta sessão; transcrição e análise não estão disponíveis.</p></div><div className="messages" aria-live="polite">{visibleMessages.length === 0 && <div className="empty-state"><strong>Comece uma conversa</strong><span>Ex.: “O que tenho hoje?”, “Quais são minhas pendências?” ou “Resumo financeiro deste mês”.</span></div>}{visibleMessages.map((message) => <div key={message.id} className={`message ${message.role}`}>{message.text && <span>{message.text}</span>}{message.attachment && renderMessageAttachment(message.attachment)}{message.mode === 'demo' && <small>Resposta de demonstração</small>}{message.mode === 'read_only' && <small>Consulta operacional · somente leitura</small>}{message.mode === 'attachment_receipt' && <small>Arquivo recebido · disponível nesta sessão</small>}</div>)}{sending && <div className="message assistant">Consultando…</div>}</div>{error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>Fechar</button></div>}<ChatComposer key={`${organizationId}:${userId}`} onSend={sendMessage} sending={sending} maxAttachmentBytes={attachmentUsage.count >= MAX_CONVERSATION_ATTACHMENTS ? 0 : Math.min(MAX_ATTACHMENT_BYTES, MAX_CONVERSATION_ATTACHMENT_BYTES - attachmentUsage.bytes)} /></section> : tab === 'tests' ? testsScreen : activeModule ? renderModuleScreen() : <section><div className="panel-heading"><div><span className="eyebrow">CENTRAL DO PROFISSIONAL</span><h2>Seu trabalho em um só lugar</h2></div><span className="demo-badge">Perfil: {role}</span></div><div className="module-grid">{visibleModules.map(([icon, title, description]) => <button type="button" className="module-card" key={title} onClick={() => openModule(title)}><span className="module-icon">{icon}</span><h3>{title}</h3><p>{description}</p><small>Em preparação</small></button>)}{role === 'owner' && <button type="button" className="module-card" onClick={openTests}><span className="module-icon">🧪</span><h3>Testes</h3><p>Diagnóstico e usuários temporários para validar o ambiente.</p><small>Somente owner</small></button>}</div><div className="panel notice"><strong>Privacidade primeiro</strong><p>Seu perfil controla quais módulos aparecem. Dados clínicos só entram quando identidade, organização, profissional e autorização estiverem validados.</p></div></section>}<nav className="bottom-nav" aria-label="Navegação principal"><button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><span>💬</span>Chat</button><button type="button" className={tab === 'panel' ? 'active' : ''} onClick={() => { setTab('panel'); setActiveModule(null); }}><span>▦</span>Painel</button>{role === 'owner' && <button type="button" className={tab === 'tests' ? 'active' : ''} onClick={openTests}><span>🧪</span>Testes</button>}</nav></main>;
}

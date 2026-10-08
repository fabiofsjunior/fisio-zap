# FisioZap — Equipe de desenvolvimento e roadmap de validação
Data: 06/10/2026  
Branch de trabalho: `TESTES`  
Regra: não desenvolver diretamente em `main`; promover somente após revisão e validação.

## Objetivo imediato
Obter hoje um MVP de teste integrado, com:
1. login Supabase funcional;
2. interface responsiva com navegação inferior em duas abas: **Chat** e **Painel**;
3. chat dentro do FisioZap (WhatsApp não é canal primário);
4. painel com os módulos acessíveis, mesmo que alguns sejam explicitamente marcados como demonstração;
5. backend acessível com health check e uma rota de chat segura;
6. build web e testes de fumaça documentados;
7. APK Android de debug apenas se o build web e o fluxo de autenticação estiverem estáveis e o ambiente Android estiver disponível.

## Estado inicial confirmado
- Frontend: Next.js + React; a página inicial exige sessão e hoje exibe um dashboard demonstrativo.
- Login: página com e-mail/senha via Supabase Auth.
- Backend: Express com somente `GET /health` implementado no ponto de entrada atual.
- Banco: migrations de base já existem; é necessário verificar aplicação das migrations e políticas RLS no projeto Supabase.
- Mobile: a estratégia documentada é manter Next.js/React e avaliar Capacitor depois de validar os fluxos web. Não existe APK pronto no repositório segundo o README atual.
- Ambiente: Vercel para o frontend; backend local durante desenvolvimento; segredos apenas em `.env.local`.

## Equipe lógica — responsabilidades, skills e entregáveis

### 1. Líder técnico / integrador
**Missão:** manter o escopo do teste de hoje pequeno, coordenar contratos entre frontend/backend e aceitar ou rejeitar entregas.
**Skill:** `skills://plugins/vercel/create-a-backend/skill.md` para decisões de fronteira entre frontend, API e serviços; `skills://plugins/vercel/verification/skill.md` para validar o fluxo completo.
**Entregáveis:** checklist de aceite, ordem de integração, registro de bloqueios, decisão explícita do que é real e do que ainda é demonstração.
**Não pode:** declarar pronto sem executar build/testes; introduzir mudança em `main`.

### 2. Engenheiro frontend / experiência mobile-first
**Missão:** entregar shell do app com login, menu inferior persistente e duas abas: Chat e Painel. Chat deve parecer uma conversa moderna, mas ser nativo da experiência FisioZap; painel concentra módulos e navegação.
**Skill:** `skills://plugins/vercel/react-best-practices/skill.md`.
**Entregáveis:** layout responsivo, estados loading/erro/vazio, acessibilidade básica, navegação que funciona em celular e desktop.
**Critério de aceite:** sem overflow horizontal em largura móvel; teclado não cobre o campo de mensagem; logout e retorno de sessão funcionam.
**Limite:** não simular persistência de dados reais sem sinalizar demonstração.

### 3. Engenheiro backend / API
**Missão:** evoluir o Express além do health check, definir contrato de chat e validação de payloads, tratar erros e CORS de forma restrita.
**Skill:** `skills://plugins/vercel/create-a-backend/skill.md` e `skills://plugins/vibe-code-security-reviewer/api-abuse-and-misuse/skill.md`.
**Entregáveis:** `GET /health`, rota de chat com schema de entrada/saída, limite de tamanho, erros previsíveis e documentação de variáveis de ambiente.
**Critério de aceite:** health responde; payload inválido recebe 4xx; erros internos não expõem stack trace, tokens ou dados clínicos.
**Limite:** nunca confiar em um `user_id` enviado pelo navegador como prova de identidade.

### 4. Especialista Supabase / banco / autenticação
**Missão:** validar variáveis, login, sessão server-side, migrations, grants e RLS antes de usar dados de pacientes.
**Skills:** `skills://plugins/supabase/supabase/skill.md`, `skills://plugins/vibe-code-security-reviewer/supabase-rls-security/skill.md` e `skills://plugins/vibe-code-security-reviewer/authentication-and-authorization/skill.md`.
**Entregáveis:** checklist de configuração Supabase, validação de sessão, confirmação de RLS por tabela e instruções de criação de usuário de teste.
**Critério de aceite:** usuário não autenticado não entra no painel; usuário A não consegue ler dados do usuário/organização B; nenhum segredo privilegiado vai para `NEXT_PUBLIC_*`.
**Bloqueio crítico:** se RLS ou isolamento não puderem ser comprovados, testar somente dados fictícios, nunca dados clínicos reais.

### 5. Engenheiro de IA / agente conversacional
**Missão:** implementar o primeiro ciclo de conversa: mensagem do profissional → API → resposta do agente → renderização no chat. Ferramentas e ações devem ser adicionadas gradualmente.
**Skill:** `skills://plugins/vercel/ai-sdk/skill.md` e `skills://plugins/vibe-code-security-reviewer/ai-application-security/skill.md`.
**Entregáveis:** contrato de mensagens, estados enviando/erro, resposta útil de fallback se não houver chave de IA e configuração server-side da chave.
**Critério de aceite:** chat envia e recebe mensagens; não apresenta mock como se fosse resposta real de IA; não acessa dados de pacientes sem autorização.
**Segurança clínica:** IA pode preparar rascunhos, nunca diagnosticar ou decidir tratamento; evolução clínica só é gravada após revisão e confirmação do fisioterapeuta.

### 6. QA / testes de integração
**Missão:** testar a jornada real de ponta a ponta e registrar evidências.
**Skill:** `skills://plugins/vercel/verification/skill.md`; usar também a skill de segurança de autenticação quando os testes envolverem sessão.
**Entregáveis:** roteiro de fumaça, resultados de build/typecheck, cenários de login, navegação, chat, API indisponível, logout e sessão expirada.
**Critério de aceite:** todo teste reportado como aprovado deve ter sido executado; defeitos bloqueadores ficam registrados e não são mascarados.

### 7. Segurança e privacidade
**Missão:** revisar o fluxo antes de conectar dados clínicos ou publicar para usuários externos.
**Skills:** `skills://plugins/vibe-code-security-reviewer/threat-modeling/skill.md`, `skills://plugins/vibe-code-security-reviewer/privacy-and-data-governance/skill.md` e `skills://plugins/vibe-code-security-reviewer/api-leak-and-key-security/skill.md`.
**Entregáveis:** verificação de segredos, escopo mínimo de dados, isolamento por profissional/organização, logs sem conteúdo clínico e lista de riscos.
**Critério de aceite:** nenhuma service-role key no cliente, APK, Git ou logs; RLS verificada; dados de teste fictícios.

### 8. DevOps / release
**Missão:** garantir que o teste possa ser repetido sem alterar produção e que o build seja rastreável.
**Skill:** `skills://plugins/vercel/deployments-cicd/skill.md` e `skills://plugins/vercel/bootstrap/skill.md`.
**Entregáveis:** comandos reproduzíveis, variáveis por ambiente, build de produção e instruções de rollback.
**Regra atual:** deploy automático somente na branch `main`; validar `TESTES` localmente ou via preview manual autorizado, sem mudar essa regra.

### 9. Responsável Android / APK (condicional)
**Missão:** avaliar e, se viável, gerar um APK de debug a partir do frontend web já validado.
**Referência técnica:** documentação oficial do Capacitor — workflow Android: https://capacitorjs.com/docs/basics/workflow e documento interno `docs/mobile-app.md`.
**Entregáveis:** decisão go/no-go, dependências e SDK necessários, build debug reproduzível e instruções para instalar no aparelho.
**Critério de aceite:** APK instala e abre, login retorna ao app, backend está acessível por HTTPS e nenhum segredo privilegiado está embutido.
**Não bloquear o teste web:** se a configuração nativa consumir o tempo disponível, entregar primeiro web responsiva + backend.

## Plano de execução para hoje

### Fase 0 — ambiente e pré-requisitos (primeiro)
- [ ] Confirmar checkout em `TESTES` e árvore de trabalho limpa.
- [ ] Instalar dependências do frontend e backend.
- [ ] Configurar `.env.local` a partir de `.env.example`, sem sobrescrever credenciais existentes.
- [ ] Confirmar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ou chave publicável compatível com o código) e testar login com conta de teste.
- [ ] Não copiar nem compartilhar valores de segredo em logs, commits ou mensagens.

### Fase 1 — experiência principal
- [ ] Login funcional.
- [ ] Após login, abrir a aplicação com navegação inferior **Chat | Painel**.
- [ ] Chat visual e funcional com estado de envio, resposta, falha de rede e botão de tentar novamente.
- [ ] Painel lista as áreas previstas: rotina, pacientes, agenda, atendimentos, evoluções, exercícios/protocolos, notificações e financeiro.
- [ ] Áreas ainda não conectadas devem estar claramente marcadas como “em preparação” ou usar dados fictícios.

### Fase 2 — integração mínima
- [ ] Iniciar backend e confirmar `GET /health`.
- [ ] Conectar o chat à rota de backend definida.
- [ ] Sem chave de IA, usar resposta de demonstração explicitamente identificada; com chave configurada, chamar o provedor apenas no servidor.
- [ ] Tratar timeout, indisponibilidade e payload inválido.
- [ ] Não conectar dados clínicos reais antes da revisão de RLS e autorização.

### Fase 3 — validação web
- [ ] `npm run build` no frontend.
- [ ] TypeScript sem erros; ajustar lint script se incompatível com a versão instalada do Next.js.
- [ ] Backend inicia e responde no health check.
- [ ] Testar login, logout, refresh, navegação Chat/Painel, envio de mensagem e erro de backend.
- [ ] Validar em desktop e largura móvel.
- [ ] Registrar resultados reais; não declarar testes que não foram executados.

### Fase 4 — APK, se houver tempo e ambiente
- [ ] Só iniciar após o build web e autenticação estarem estáveis.
- [ ] Confirmar Android Studio/SDK/JDK instalados e frontend acessível por HTTPS.
- [ ] Seguir a estratégia Capacitor descrita em `docs/mobile-app.md`; manter o frontend único.
- [ ] Gerar APK de debug, instalar e validar login + retorno ao app + chat.
- [ ] Se algum pré-requisito faltar, registrar o bloqueio e preservar o teste web como entrega principal.

## Definition of Done — teste de hoje
- [ ] Repositório continua em `TESTES`; `main` não foi alterada.
- [ ] Login Supabase validado ou bloqueio exato identificado.
- [ ] Chat e Painel acessíveis após login.
- [ ] Backend responde e o frontend consegue consumir a API.
- [ ] Build e testes executados com resultados registrados.
- [ ] Segredos protegidos e nenhum dado clínico real usado no teste.
- [ ] APK: entregue somente se realmente compilado e testado; caso contrário, motivo e próximo passo documentados.

## Bloqueios que precisam ser resolvidos antes de prometer um teste integrado
1. O backend atual implementa somente `GET /health`; ainda não existe endpoint de chat no arquivo principal.
2. A tela inicial atual é um dashboard demonstrativo; o menu inferior Chat/Painel ainda precisa ser implementado.
3. O login depende de credenciais válidas e configuração correta no Supabase.
4. O APK não faz parte do estado atual confirmado do repositório e depende de SDK/ambiente Android e URL HTTPS acessível.
5. Este documento define uma equipe lógica e responsabilidades; cada entrega só deve ser considerada feita após execução e evidência, não apenas por estar atribuída a um papel.

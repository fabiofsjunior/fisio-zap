# Checkpoint — Frontend FisioZap

**Responsável lógico:** engenheiro frontend / experiência mobile-first.  
**Skill obrigatória:** `skills://plugins/vercel/react-best-practices/skill.md`.  
**Contexto global:** leia primeiro `../CHECKPOINT.md` e `../docs/equipe-desenvolvimento-roadmap.md`.

## Estado conhecido no último levantamento
- Next.js App Router + React.
- `app/login/page.tsx` contém formulário de login com Supabase Auth por e-mail/senha.
- `app/page.tsx` protege a página usando `requireUser()`, mas mostra um dashboard demonstrativo.
- A experiência final com navegação inferior persistente e abas **Chat** e **Painel** ainda precisa ser confirmada/implementada.
- Não assumir que Chat, módulos do Painel, logout ou integração de chat já estão prontos.

## Missão
Entregar uma experiência responsiva, mobile-first e clara:
1. login e estado de sessão;
2. shell autenticado com navegação inferior **Chat** / **Painel**;
3. Chat interno do FisioZap com lista de mensagens, campo de envio e estados carregando/erro/vazio;
4. Painel que centraliza os módulos do MVP, identificando explicitamente o que for demonstração;
5. logout funcional e retorno adequado para login;
6. acessibilidade básica, foco visível, navegação por teclado e tratamento de viewport/teclado móvel.

## Regras de implementação
- Inspecione `globals.css`, `layout.tsx`, `proxy.ts`, `login/page.tsx` e `page.tsx` antes de modificar.
- Reutilize o design e estilos existentes quando possível; evite reescrever o app sem necessidade.
- Nunca colocar service-role key ou segredo privado em variável `NEXT_PUBLIC_*`.
- Não simular salvamento ou resposta real de IA sem sinalizar que é demonstração.
- Não acessar dados clínicos reais antes da validação de autorização/RLS.
- Para chamar backend, use a URL de ambiente documentada e o contrato acordado com `backend/CHECKPOINT.md`; não invente endpoint.
- Não contorne a proteção de sessão para fazer a tela parecer funcional.

## Critérios de aceite
- [ ] Usuário não autenticado é enviado para `/login`.
- [ ] Login válido redireciona para a área autenticada; erro é apresentado sem expor detalhes internos.
- [ ] Abas Chat e Painel são clicáveis e funcionam em viewport móvel e desktop.
- [ ] Chat mostra envio, resposta, carregamento, erro de API e estado vazio.
- [ ] Logout encerra a sessão e impede voltar ao conteúdo protegido.
- [ ] Não há overflow horizontal em largura móvel; campo de mensagem continua utilizável com teclado virtual.
- [ ] Conteúdo demonstrativo está claramente rotulado.
- [ ] Build/typecheck/lint aplicáveis executados e resultados registrados.

## Próximo passo
Validar login/sessão e construir a navegação Chat/Painel sobre a estrutura existente. Depois, conectar o Chat ao contrato documentado pela equipe backend.

## Registro de execução
Agente: preencher ao trabalhar.  
Data: preencher ao trabalhar.  
Status: **pendente de validação por execução**.

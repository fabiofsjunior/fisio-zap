# S4 — Atendimento e Evolução: plano de execução

Base: S3 integrada na main pela PR #12 (squash ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d).

## Objetivo
Transformar agendamentos em atendimentos documentados, com histórico clínico organizado e seguro, sem modificar o login existente.

## Entregas por fase
- [ ] S4.1 — Modelo de dados e RLS: atendimentos, evoluções, exercícios prescritos e protocolos vinculados a paciente, profissional e organização; migrations reproduzíveis; políticas por operação; proibição de acesso cruzado.
- [ ] S4.2 — API autenticada: iniciar/finalizar atendimento, criar rascunho de evolução, consultar histórico cronológico, associar exercícios e protocolos, confirmar registro; validação de entradas e de vínculos entre entidades.
- [ ] S4.3 — Interface: fluxo Agenda → Atendimento → Evolução → Histórico, estados de carregamento/erro/vazio, salvamento explícito, revisão antes da confirmação e UX responsiva.
- [ ] S4.4 — Integração e QA: testes negativos multi-organização, regressão S2/S3, integridade referencial, CI verde e evidências documentadas.

## Regras essenciais
1. Toda organização deriva da sessão/membership autenticado; nunca confiar em organization_id enviado pelo cliente.
2. Dados clínicos são sensíveis: privilégio mínimo, RLS e sem exposição em logs, erros ou telemetria.
3. Evoluções confirmadas devem preservar rastreabilidade; alterações posteriores requerem histórico/auditoria, não sobrescrita silenciosa.
4. Protocolos e exercícios são apoio ao profissional; nenhuma recomendação automática substitui validação clínica.
5. Não modificar autenticação já validada, nem criar deploys de Preview Vercel.
6. Desenvolver em `feature/*` e abrir PR com base em `TESTES` após revisão e validação automatizada. Integrar em `TESTES` somente após os critérios de qualidade; promover para `main` apenas com homologação e autorização explícita.

## Critérios de aceite
- Migrations locais reproduzíveis e RLS validada para SELECT/INSERT/UPDATE/DELETE, incluindo negações entre organizações.
- API e frontend integrados com teste de criação, rascunho, confirmação e histórico.
- Cobertura de autorização, entradas inválidas, concorrência e regressão de S3.
- Quatro jobs de CI verdes no HEAD, revisão de segurança e checklist atualizado.
- Testes com dados sintéticos; não usar prontuários reais no QA.

## Checkpoint
- [x] S3 integrada na main.
- [x] Branch exclusiva S4 criada.
- [x] Escopo e critérios de aceite definidos.
- [ ] S4.1 implementada e validada.
- [ ] S4.2 implementada e validada.
- [ ] S4.3 implementada e validada.
- [ ] S4.4 validada; PR aprovada e mergeada.

## Evidências locais — 09/10/2026
- S4.1: migration e RLS aplicadas em PostgreSQL embutido isolado; 30 verificações sintéticas de constraints, triggers e acesso por organização/profissional passaram. O teste oficial `supabase test db --local` ainda depende do CI/Supabase local.
- S4.2: suíte automatizada do backend passou com 29/29 testes no head integrado.
- S4.3: `npm run build` passou; revisão estática confirmou a proteção contra respostas atrasadas após troca de organização/dia. Não houve teste funcional no navegador.
- S4.4: aguardando CI oficial, execução pgTAP pelo Supabase CLI e homologação funcional. A pendência de QA da S3 na issue #11 continua aberta.

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
- [x] S4.1 implementada; migration, constraints, triggers e RLS passaram nas validações automatizadas.
- [x] S4.2 implementada; APIs passaram na suíte automatizada.
- [x] S4.3 implementada; build de produção passou. Teste funcional no navegador ainda pendente.
- [x] S4.4: CI automatizado 4/4 verde e PR #17 integrada em `TESTES`.
- [ ] Homologação funcional local da S4 pelo proprietário.
- [ ] QA funcional da S3 — issue #11 continua aberta.

## Evidências — 09/10/2026
- S4.1: 30 verificações sintéticas de constraints, triggers e RLS passaram em PostgreSQL embutido isolado. No CI oficial, o reset das migrations, o lint do schema, 19 testes pgTAP e o job de RLS com Supabase local passaram.
- S4.2: `npm test` passou com 29/29 testes localmente e no job de backend do CI.
- S4.3: `npm run build` passou; revisão estática cobriu respostas atrasadas após troca de organização/dia. O fluxo ainda aguarda teste funcional no navegador.
- S4.4: workflow CI run #153 passou em todos os quatro jobs (backend, web, database e RLS). A PR #17 foi integrada em `TESTES` pelo commit `94bc8d79c4b6939ff123256677576f00e61f9721`; o commit de merge não alterou o tree validado no head da PR.
- A homologação pelo proprietário não foi concluída. A issue #11 da S3 permanece aberta. Nenhuma migration remota foi aplicada e nenhum Preview Deployment foi ativado.

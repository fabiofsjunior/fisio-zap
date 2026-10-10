# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `feature/* → TESTES → main`
**Estado observado em 10/10/2026:** S5.1 integrada em `TESTES`; S5.2 em desenvolvimento na `feature/s5-upcoming-appointments`. Não integrar em `main` sem fluxo autorizado.

## Checkpoint atual — 10/10/2026
- `TESTES` está em `5143a7c8cd2cfc83f96fc33c2e46b523339212f9`, após os merges #19, #20 e #22.
- PR #19 (hardening dos scripts de teste Supabase local) e PR #20 (limites de agenda seguros para horário de verão) foram integradas em `TESTES`; CI pós-merge #160 aprovou os quatro jobs (backend, web, database/pgTAP e RLS).
- PR #22 (S5.1 — central pessoal de tarefas) foi integrada em `TESTES`; CI da PR #164 e pós-merge #165 aprovaram 4/4. A issue #21 continua aberta até homologação funcional do proprietário.
- PR #18 continua aberta e não foi integrada.
- Issues #11 e #13–#16 continuam abertas. A homologação funcional S3/S4 pelo proprietário permanece pendente.
- Issue #23 registra S5.2 — alertas internos de atendimentos próximos; desenvolvimento em `feature/s5-upcoming-appointments`.
- Nenhuma migration ou alteração em banco remoto foi executada. Nenhum Preview Deployment foi ativado.
- `main` permanece intacta.
- Validação local da S5.2: backend 41/41, guard 6/6, sintaxe/diff check e build web aprovados. Revisões de QA e segurança concluídas; CI da S5.2 ainda pendente.
- Próximo passo: concluir revisões independentes, abrir PR da S5.2 para `TESTES` e aguardar CI; proprietário pode homologar S5.1 localmente em paralelo.

## Progresso em 06/10/2026
- Login Supabase: validado e não alterado.
- ADMIN e TESTE: sincronizados e funcionando.
- Criação de usuário pelo launcher local: validada.
- Smoke/RLS/backend health: previamente validados.
- Auditoria do Supabase remoto realizada.
- Drift de schema e de histórico de migrations documentado.
- Migration de reconciliação aditiva criada em `TESTES`.
- Hardening histórico tornado replay-safe.
- CI de `TESTES` passou a validar replay das migrations e lint do schema.
- Nenhum módulo funcional clínico foi iniciado.

## Estado da S1.5
**Em validação — ainda não marcar como concluída.**

A reconciliação foi desenhada para não destruir os dados existentes. O remoto contém estruturas mais avançadas que o histórico Git, enquanto algumas estruturas/colunas MVP legadas ainda são mantidas na migration por segurança. A conclusão depende da execução verificável do reset/lint local e da confirmação do histórico remoto.

## Próximos passos
1. Aguardar/inspecionar o CI de `TESTES`.
2. Corrigir qualquer falha de replay SQL.
3. Executar os testes de smoke/RLS existentes.
4. Confirmar histórico de migrations.
5. Somente depois avançar para os módulos funcionais do FisioZap.

## 08/10/2026 — retomada da TESTES
- Branch `TESTES` recriada a partir da `main` para retomada controlada da validação da S1.5.
- O commit deste checkpoint serve apenas para disparar novamente o CI; nenhuma funcionalidade de negócio foi iniciada.


## 08/10/2026 — início da S2 Pacientes
- S1.5 concluída e promovida para `main` pela PR #6 após CI verde.
- S2 iniciada exclusivamente em `TESTES`.
- Migration de hardening de pacientes criada com email, integridade de organização/profissional/grupo, índices e RLS dedicada.
- API server-side de pacientes implementada com autenticação Bearer, validação de entrada e CRUD.
- Interface autenticada de pacientes conectada ao painel.
- Próxima validação: CI, build frontend, testes backend e replay das migrations; depois testes negativos/RLS e PR para `main`.

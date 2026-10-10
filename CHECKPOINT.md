# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `feature/* → TESTES → main`
**Estado observado em 10/10/2026:** S4 integrada em `TESTES`; S5.1 em implementação na `feature/s5-notifications`. Não integrar em `main` sem fluxo autorizado.

## Checkpoint atual — 10/10/2026
- `TESTES` está em `1653fb556ed352093e13e3ac95b71e0aadc851b4`, após os merges #19 e #20.
- PR #19 (hardening dos scripts de teste Supabase local) e PR #20 (limites de agenda seguros para horário de verão) foram integradas em `TESTES`; CI pós-merge #160 aprovou os quatro jobs (backend, web, database/pgTAP e RLS).
- PR #18 continua aberta e não foi integrada.
- Issues #11 e #13–#16 continuam abertas. A homologação funcional S3/S4 pelo proprietário permanece pendente.
- Issue #21 registra S5.1 — central pessoal de tarefas e lembretes. Implementação local na branch `feature/s5-notifications`; ainda aguarda revisão e PR/CI. A issue deve permanecer aberta até homologação.
- Nenhuma migration ou alteração em banco remoto foi executada. Nenhum Preview Deployment foi ativado.
- `main` permanece intacta.
- Validação local da S5.1: backend 35/35; scripts/tests (guard de mutações) 6/6; sintaxe do teste RLS e `git diff --check` aprovados; `npm run build` aprovado. A validação Supabase/pgTAP/RLS desta branch depende do CI após abrir PR, pois não foi executada contra banco local neste ambiente.
- Próximo passo: concluir revisões independentes, corrigir eventuais bloqueios, abrir PR da `feature/s5-notifications` para `TESTES`, aguardar CI e deixar a homologação funcional local para o proprietário.

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

# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `feature/* → TESTES → main`
**Estado observado em 10/10/2026:** S6.1 e S7.1 integradas em `TESTES`; homologações funcionais locais do proprietário pendentes.

## Checkpoint atual — 10/10/2026
- S7.2: resumo financeiro somente leitura em `feature/s7-financial-assistant`, baseada em `ee7cbbf`. Issue #30 permanece aberta para homologação funcional. Contrato e roteiro em `docs/S7-ASSISTENTE-FINANCEIRO.md`; integração condicionada ao CI e revisões. Nenhuma migration nova ou alteração em banco remoto.
- Validação local S7.2: backend 64/64, guard local 6/6, teste DST, build web, sintaxe e diff aprovados. CI oficial da PR ainda deve ser consultado antes de integrar; não considerar essa evidência homologação funcional.
- `TESTES` está em `31c5dc263c180bbdd12e60944e8e1b34d1c6f639`, após a integração da PR #28 (S7.1). CI da PR #28 #172 e pós-merge #173 aprovaram 4/4 jobs.
- `main` permanece em `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`; não houve promoção para produção.
- PR #26 foi integrada em `TESTES` no merge commit `20cfc9c45a2ccb0efbf4affcb7053c9672e6dd3e`. O CI #169 identificou um fixture RLS inválido; a correção foi validada no CI #170 (4/4) e no CI pós-merge #171 (4/4).
- Issue #25 continua aberta para homologação funcional local do proprietário. S6.1 não alterou banco remoto.
- Issues #11, #13–#16, #21 e #23 continuam abertas; as homologações funcionais anteriores seguem pendentes.
- PR #28 (`feature/s7-assistant-readonly` → `TESTES`) foi integrada no merge commit `31c5dc263c180bbdd12e60944e8e1b34d1c6f639` após CI 4/4. S7.1 consulta somente a agenda atual e as pendências próprias, sem escrita ou leitura de conteúdo clínico.
- Issue #27 permanece aberta para o proprietário testar localmente o fluxo do assistente e confirmar a homologação funcional.
- Nenhuma migration ou alteração em banco remoto foi executada. Nenhum Preview Deployment foi ativado.
- `main` permanece intacta.
- Último CI concluído em `TESTES`: run #173, 4/4 jobs verdes (backend, web, database/pgTAP e RLS); run #172 da PR #28 também passou 4/4.
- Validação local S7.1: backend 57/57, guard local 6/6, sintaxe/diff, teste de faixa DST e build de produção web aprovados. Os testes do endpoint cobrem autenticação/membership, o dia atual, passado/futuro, dias locais de 23/24/25 horas, limites exclusivos e resultados vazios; backend executado com loopback restrito.
- Revisões independentes de Sakura da QA e Shikamaru da Segurança não encontraram bloqueios; o relógio usado na validação é do servidor e os testes de datas são determinísticos.
- A cópia local não tem Supabase CLI/Docker; os runs oficiais #172 e #173 validaram replay, pgTAP e RLS usando Supabase local no CI.
- Próximo passo: homologação local do S7.1 pelo proprietário. Manter issues #25 e #27 abertas até a confirmação funcional; não promover para `main`.

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

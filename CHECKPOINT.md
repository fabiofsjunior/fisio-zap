# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `feature/* → TESTES → main`
**Estado observado em 10/10/2026:** S6.1 integrada em `TESTES`; S7.1 em desenvolvimento em `feature/s7-assistant-readonly`.

## Checkpoint atual — 10/10/2026
- `TESTES` está em `20cfc9c45a2ccb0efbf4affcb7053c9672e6dd3e`, após a integração da PR #26 (S6.1). CI da PR #26 #170 e pós-merge #171 aprovaram 4/4 jobs.
- `main` permanece em `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`; não houve promoção para produção.
- PR #26 foi integrada em `TESTES` no merge commit `20cfc9c45a2ccb0efbf4affcb7053c9672e6dd3e`. O CI #169 identificou um fixture RLS inválido; a correção foi validada no CI #170 (4/4) e no CI pós-merge #171 (4/4).
- Issue #25 continua aberta para homologação funcional local do proprietário. S6.1 não alterou banco remoto.
- Issues #11, #13–#16, #21 e #23 continuam abertas; as homologações funcionais anteriores seguem pendentes.
- Issue #27 define S7.1. A branch remota `feature/s7-assistant-readonly` parte de `20cfc9c`; a implementação local consulta somente a agenda do dia e as pendências próprias, sem escrita ou leitura de conteúdo clínico.
- Nenhuma migration ou alteração em banco remoto foi executada. Nenhum Preview Deployment foi ativado.
- `main` permanece intacta.
- Último CI concluído em `TESTES`: run #171, 4/4 jobs verdes (backend, web, database/pgTAP e RLS).
- Validação local S7.1: backend 57/57, guard local 6/6, sintaxe/diff, teste de faixa DST e build de produção web aprovados. Os testes do endpoint cobrem autenticação/membership, o dia atual, passado/futuro, dias locais de 23/24/25 horas, limites exclusivos e resultados vazios; backend executado com loopback restrito.
- Revisões independentes de Sakura da QA e Shikamaru da Segurança não encontraram bloqueios; o relógio usado na validação é do servidor e os testes de datas são determinísticos.
- Supabase CLI/Docker não estão disponíveis nesta cópia; CI oficial com replay, pgTAP e RLS local ainda é necessário antes da integração.
- Próximo passo: publicar somente as mudanças S7.1 na branch `feature/s7-assistant-readonly`, abrir PR para `TESTES`, aguardar CI 4/4 e manter issues #25 e #27 abertas até homologação do proprietário.

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

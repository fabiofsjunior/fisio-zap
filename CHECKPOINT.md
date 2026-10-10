# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `feature/* → TESTES → main`
**Estado observado em 10/10/2026:** S5 integrada em `TESTES`; S6.1 implementada em `feature/s6-financial-ledger`, aguardando CI e integração.

## Checkpoint atual — 10/10/2026
- `TESTES` está em `98961459a3d1aa027ce90390be8d4361d425e6f1`, após a integração da PR #18 (checkpoint S4) a pedido do proprietário. A PR #18 tinha CI #155 aprovado em 4/4; CI pós-merge #168 está em execução.
- `main` permanece em `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`; não houve promoção para produção.
- PR #18 foi integrada em `TESTES` no commit `98961459a3d1aa027ce90390be8d4361d425e6f1`.
- Issues #11, #13–#16, #21 e #23 continuam abertas; homologações S3/S4/S5 pelo proprietário seguem pendentes.
- Issue #25 registra a S6.1 — livro-caixa; a implementação foi concluída localmente em `feature/s6-financial-ledger`, com validação automatizada local e revisões independentes sem bloqueios.
- A cópia de trabalho local partia de uma árvore igual à de `TESTES` antes da PR #18; a publicação da S6.1 será derivada do head atual `9896145`.
- Nenhuma migration ou alteração em banco remoto foi executada. Nenhum Preview Deployment foi ativado.
- `main` permanece intacta.
- Último CI da branch `TESTES` concluído antes da PR #18: run #167, 4/4 jobs verdes (backend, web, database/pgTAP e RLS).
- Validação local S6.1: backend 47/47, guard Supabase local, teste de faixa DST, verificações de sintaxe/diff e build de produção web aprovados. O Supabase CLI e Docker não estão instalados nesta cópia; replay de migration, pgTAP e RLS dependem do CI.
- Próximo passo: publicar a PR S6.1 para `TESTES`, aguardar todos os jobs e manter a issue #25 aberta para homologação funcional do proprietário.

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

# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `TESTES`  
**Estado:** S1.5 em validação; autenticação e fluxo local permanecem preservados.

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

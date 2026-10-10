# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `feature/* → TESTES → main`
**Estado observado em 10/10/2026:** S6.1 e S7.1–S7.4 integradas em `TESTES`; S11.1 Android em validação pelo CI; homologações funcionais locais do proprietário pendentes.

## Checkpoint atual — 10/10/2026
- O proprietário definiu o canal como Chat do próprio app Android instalado, semelhante ao WhatsApp. A integração externa S8 e o painel simulador foram interrompidos; todos os arquivos dessa tentativa foram revertidos antes de commit/publicação.
- S11.1: bootstrap APK em `feature/android-chat-bootstrap`, baseada em `c545656`; issue #36 e PR #37 abertas. WebView Kotlin mantém frontend/regras web, URL HTTPS, mídia com escopo mínimo e CI Android dedicado. Sem publicação em loja ou Vercel Preview; homologação real pendente.
- S7.4 integrada pela PR #35 em `c5456565f77fb43716b30f1992fad4da4291d345`; feature commit `f768820`. CI #180 e pós-merge #181 aprovados. A transcrição permanece desativada por padrão; issue #34 aberta para homologação.
### Evidências da preparação e entregas anteriores
- S7.4: transcrição opcional de áudio em `feature/chat-audio-transcription`, baseada em `f18a491`; issue #34 aberta. Recurso desativado por padrão, integração server-only com OpenAI, consentimento explícito e revisão do texto antes de envio. Nenhuma chamada real ao provedor nos testes. Roteiro/configuração em `docs/S7-TRANSCRICAO-AUDIO.md`. Validação local: backend 79/79, composer 19/19, guard 6/6, DST, TypeScript/build, sintaxe e diff aprovados; revisões independentes sem bloqueios. Integração condicionada ao CI oficial desta branch. Testes simulam o provedor e as APIs de mídia; integração real de sessão/status do shell e dispositivos depende da homologação.
- Base histórica da S7.3: `TESTES` = `f18a491403cdb610353e6caa1fa8b6b781b3bd64`, merge da PR #33; CI #178 e pós-merge #179 aprovados. S7.2 foi integrada pela PR #31 em `36edc5b`, CI #176/#177 aprovados. Issues #30/#32 permanecem abertas para homologação. Não existiam PRs abertas no início daquela etapa.

- S7.3: áudio e anexos de sessão em `feature/chat-audio-attachments`, baseada em `36edc5b`; issue #32 aberta para homologação. Backend 69/69, interface 15/15 (DOM/MediaRecorder simulados), guard 6/6, DST, TypeScript/build, sintaxe e diff aprovados localmente. Revisões de Sakura QA e Shikamaru Segurança sem bloqueadores; integração condicionada ao CI oficial. Sem persistência, transcrição, interpretação de anexos ou alterações em banco remoto. Roteiro em `docs/S7-CHAT-AUDIO-ANEXOS.md`.
- S7.2: resumo financeiro somente leitura em `feature/s7-financial-assistant`, baseada em `ee7cbbf`. Issue #30 permanece aberta para homologação funcional. Contrato e roteiro em `docs/S7-ASSISTENTE-FINANCEIRO.md`; integração condicionada ao CI e revisões. Nenhuma migration nova ou alteração em banco remoto.
- Validação local S7.2: backend 64/64, guard local 6/6, teste DST, build web, sintaxe e diff aprovados. CI oficial da PR ainda deve ser consultado antes de integrar; não considerar essa evidência homologação funcional.
- Base histórica da S7.1: `TESTES` estava em `31c5dc263c180bbdd12e60944e8e1b34d1c6f639`, após a integração da PR #28 (S7.1). CI da PR #28 #172 e pós-merge #173 aprovaram 4/4 jobs.
- `main` permanece em `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`; não houve promoção para produção.
- PR #26 foi integrada em `TESTES` no merge commit `20cfc9c45a2ccb0efbf4affcb7053c9672e6dd3e`. O CI #169 identificou um fixture RLS inválido; a correção foi validada no CI #170 (4/4) e no CI pós-merge #171 (4/4).
- Issue #25 continua aberta para homologação funcional local do proprietário. S6.1 não alterou banco remoto.
- Issues #11, #13–#16, #21 e #23 continuam abertas; as homologações funcionais anteriores seguem pendentes.
- PR #28 (`feature/s7-assistant-readonly` → `TESTES`) foi integrada no merge commit `31c5dc263c180bbdd12e60944e8e1b34d1c6f639` após CI 4/4. S7.1 consulta somente a agenda atual e as pendências próprias, sem escrita ou leitura de conteúdo clínico.
- Issue #27 permanece aberta para o proprietário testar localmente o fluxo do assistente e confirmar a homologação funcional.
- Nenhuma migration ou alteração em banco remoto foi executada. Nenhum Preview Deployment foi ativado.
- `main` permanece intacta.
- CI histórico da S7.1 em `TESTES`: run #173, 4/4 jobs verdes (backend, web, database/pgTAP e RLS); run #172 da PR #28 também passou 4/4.
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

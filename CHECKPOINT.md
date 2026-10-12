# FisioZap — Checkpoint global para agentes

## Sprint S10.2 — 12/10/2026
- Base remota `TESTES`: merge `3b8aaca443fcfdbf851d302965069500e966e4be` da PR #47; CI da PR #199 e pós-merge #200 aprovados 4/4. `main` permanece `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`.
- S10.2 em `feature/s10-member-roles`, issue #48: owner altera o papel de membros existentes entre professional/coordinator/administrative; owner imutável. Veja `docs/S10-PAPEIS-EQUIPE.md`.
- Migrations S9/S10 continuam sem aplicação em banco remoto. Issues #40/#42/#44/#46/#48 aguardam homologação funcional do proprietário; sem promoção para `main`.

## Sprint S10.1 — 12/10/2026
- Base remota `TESTES`: merge `05e4dbe22689eca39890d8aca2820ef2c1bc7f56` da PR #45, CI da PR #197 e pós-merge #198 aprovados 4/4. `main` permanece `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`.
- S10.1 em `feature/s10-team-directory`, issue #46: diretório somente leitura de equipe para owner/coordinator, com retorno mínimo e isolamento por organização. Veja `docs/S10-DIRETORIO-EQUIPE.md`.
- Migrations S9/S10 não foram aplicadas ao Supabase remoto. Issues #40/#42/#44/#46 aguardam homologação funcional do proprietário; não promover para `main`.

## Sprint S9.3 — 11/10/2026
- Base remota `TESTES`: merge `f58441b06ff30c04a5cb3b965a51002a011466fe` da PR #43, CI da PR #192 e pós-merge #193 aprovados 4/4. `main` segue `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`.
- S9.3 em `feature/s9-private-document-files`, issue #44: anexo único privado PDF/JPEG/PNG até 5 MiB, leitura com JWT e gravação validada pelo backend, bucket e policy SELECT por documento; integração real no CI local. Veja `docs/S9-ARQUIVOS-PRIVADOS.md`.
- As migrations S9 não foram aplicadas ao Supabase remoto. Issues #40, #42 e #44 permanecem abertas até homologação funcional do proprietário em ambiente de teste; não promover para `main`.

## Sprint S9.2 — 11/10/2026
- Base remota `TESTES`: merge `90d6a89768d1ad19ce309765982f83a7edd97fb6` da PR #41 (S9.1), CI da PR #190 e pós-merge #191 aprovados 4/4. `main` segue `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`.
- S9.2 na branch `feature/s9-document-expiry-alerts`, issue #42: consulta somente leitura de vencimentos próprios na central, até 30 dias UTC, sem persistir ou enviar notificações. Veja `docs/S9-AVISOS-VENCIMENTO.md`.
- Migrations S9.1 só foram reproduzidas no CI local; nenhuma alteração no Supabase remoto. A homologação das issues #40/#42 depende de ambiente de teste com schema S9.1 e confirmação do proprietário. Não promover para `main`.

## Sprint S9.1 — 11/10/2026
- `TESTES` atual: merge `00b24312a4b7a59d6b157751d9fd73182fd96bdb` da PR #39, com CI #188 (4/4) e Android #6 aprovados. `main` permanece `ffeef4a72fe8c695ef7bdf655c8beb0aceeeee2d`.
- S8 (WhatsApp externo) continua adiada pela escolha do Chat no próprio app. S11.1 e túnel ngrok integrados, com homologação no aparelho do proprietário ainda pendente (issues #36 e #38).
- S9.1 em `feature/s9-professional-documents`, issue #40: API, UI, migration e pgTAP para metadados de documentos profissionais e vencimentos. Sem arquivos, dados clínicos, integração externa ou migration remota. Veja `docs/S9-DOCUMENTOS-PROFISSIONAIS.md`.
- A integração em `TESTES` depende de revisão independente e CI oficial; a homologação funcional depende do proprietário. Não fechar issue #40 por testes automatizados.

**Branch obrigatória:** `feature/* → TESTES → main`
**Estado observado em 10/10/2026:** S6.1 e S7.1–S7.4 integradas em `TESTES`; S11.1 Android em validação pelo CI; homologações funcionais locais do proprietário pendentes.

## Checkpoint atual — 10/10/2026
- Retomada: merge remoto `181aba4` regrediu arquivos das entregas S2–S7 e Android. Branch `feature/local-ngrok-3847` recupera o snapshot validado `da065e8`, mantendo as duas rotas administrativas novas e bloqueando-as no modo túnel. Não houve reset/force push nem alteração em banco remoto.
- Issue #38 aberta: launcher `dev:tunnel` e opção 15 do menu local; frontend loopback 3847, backend 3848, link HTTPS único para APK. Integração condicionada ao CI e revisões; ngrok/dispositivo reais pendentes no computador do proprietário.
- S11.1: PR #37 integrada em `da065e8`, CI da PR #184/Android #3 e pós-merge #185/Android #4 aprovados. Issue #36 aberta para homologação.
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

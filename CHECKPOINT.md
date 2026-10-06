# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `TESTES`  
**Estado:** MVP web em integração; contratos de Chat/API implementados e agora existe uma camada reproduzível de smoke test e teste negativo de RLS.

## Progresso em 06/10/2026
- Segurança Supabase: hardening aplicado; Security Advisor retornou zero lints.
- Frontend: shell autenticado com **Chat | Painel**, logout e estados básicos implementados.
- Backend: `POST /chat` com autenticação Bearer, validação, limite de tamanho, rate limit e fallback de demonstração implementado.
- Testes: adicionados `npm run test:smoke` para login → Chat → API → resposta → logout e `npm run test:rls` para isolamento entre organizações.
- CI: workflow de `TESTES` passou a validar build web e testes do backend; não depende de lockfile ausente.
- Bootstrap: sincronização das contas de teste não depende mais de `dotenv`; o comando usa `node --env-file=.env.local`.
- Regra preservada: `main` não foi alterada.
- APK continua fora do caminho crítico.

## Bloqueio atual
O schema remoto do Supabase está mais avançado que as migrations atualmente versionadas no repositório. O projeto remoto possui tabelas como `clinical_notes`, `patient_groups`, `documents`, `skills` e `patient_protocols`, enquanto a migration MVP versionada é mais antiga. Antes de declarar a base reproduzível, esse drift precisa ser reconciliado.

Além disso, o projeto remoto está sem usuários neste momento; portanto o smoke test real depende de executar primeiro o bootstrap local com o `.env.local` configurado.

## Próximo passo
1. Executar localmente `npm run bootstrap:test-accounts`.
2. Iniciar o backend e o frontend pelo launcher habitual.
3. Executar `npm run test:smoke`.
4. Executar `npm run test:rls`.
5. Registrar os resultados reais no checkpoint.
6. Depois, reconciliar as migrations com o schema remoto antes de conectar dados clínicos e IA real.

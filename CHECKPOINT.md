# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `TESTES`  
**Estado:** MVP web em integração; autenticação, Chat/API, smoke test e isolamento RLS validados no ambiente de teste.

## Progresso em 06/10/2026
- Segurança Supabase: hardening das funções `SECURITY DEFINER` aplicado e versionado.
- Frontend: shell autenticado com **Chat | Painel**, logout e estados básicos implementados.
- Backend: `POST /chat` com autenticação Bearer, validação, limite de tamanho, rate limit e fallback de demonstração implementado.
- Autenticação: login pelo endpoint SSR `/api/auth/login` validado com a conta de teste.
- Bootstrap: `npm run bootstrap:test-accounts` executado com sucesso.
- Smoke test: `npm run test:smoke` executado com sucesso em **5/5**: login Supabase → identidade → health do backend → Chat autenticado → logout.
- RLS: teste negativo entre organizações validado; leitura e alteração de paciente sem vínculo permanecem bloqueadas.
- CI: workflow de `TESTES` valida build web e testes do backend.
- Regra preservada: `main` não foi alterada.
- APK continua fora do caminho crítico.

## Validação adicional do login
Foi reproduzido o POST para `/api/auth/login` usando diretamente as credenciais carregadas de `.env.local`, com resposta HTTP 200. O login manual com `teste@fisiozap.local` também retorna HTTP 200. A falha observada para `admin@fisiozap.local` é específica da credencial digitada para essa conta, não do mecanismo de autenticação.

## Bloqueio atual
O schema remoto do Supabase está mais avançado que as migrations versionadas no repositório. O remoto possui, entre outras, as tabelas `clinical_notes`, `patient_groups`, `documents`, `skills` e `patient_protocols`, enquanto a base versionada ainda contém estruturas diferentes, incluindo `evolutions`. Portanto, ainda não é seguro declarar a base reproduzível.

A verificação atual do Security Advisor também identificou **1 aviso**: proteção contra senhas comprometidas (HaveIBeenPwned) desabilitada. Isso é uma melhoria de segurança separada do fluxo de autenticação já validado.

## Próximo passo exato
1. Reconciliar o schema remoto com as migrations versionadas sem alterar dados clínicos existentes.
2. Gerar uma migration incremental e auditável para representar o schema real.
3. Revisar RLS, grants, índices, constraints e funções das novas tabelas.
4. Executar Security Advisor novamente.
5. Validar em ambiente limpo antes de conectar dados clínicos reais e IA.

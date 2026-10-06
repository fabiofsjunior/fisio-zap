# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `TESTES`  
**Estado:** MVP web em integração; primeira fatia Chat/Painel + API foi implementada, mas ainda não validada por execução local ponta a ponta.

## Progresso em 06/10/2026
- Segurança Supabase: hardening aplicado; Security Advisor retornou zero lints.
- Frontend: shell autenticado com **Chat | Painel**, logout e estados básicos implementados.
- Backend: `POST /chat` com autenticação Bearer, validação, limite de tamanho, rate limit e fallback de demonstração implementado.
- Regra preservada: `main` não foi alterada.
- APK continua fora do caminho crítico.

## Bloqueio atual
O schema remoto do Supabase está mais avançado que as migrations atualmente versionadas no repositório. Antes de declarar a base reproduzível, esse drift precisa ser reconciliado.

## Próximo passo
Executar smoke tests reais da jornada login → Chat → API → resposta → logout e, em paralelo, completar os testes negativos de RLS com dados fictícios. Só depois disso avançar para IA real e módulos clínicos.

# Checkpoint — Frontend FisioZap

**Responsável lógico:** engenheiro frontend / experiência mobile-first.

## Execução — 06/10/2026
- A página protegida `app/page.tsx` continua exigindo sessão via `requireUser()`.
- Foi criado o shell autenticado `app/components/fisio-shell.tsx`.
- Navegação inferior **Chat | Painel** implementada em experiência responsiva.
- Chat interno implementado com estado vazio, envio, carregamento, erro e resposta explicitamente marcada como demonstração.
- Chat envia `POST /chat` com Bearer token Supabase; identidade não é enviada pelo cliente.
- Painel lista os módulos do MVP como **Em preparação**, sem simular persistência.
- Logout encerra a sessão e retorna para `/login`.
- `NEXT_PUBLIC_BACKEND_URL` documentado no `.env.example`.

## Pendências
- [ ] Executar build/typecheck/lint em ambiente local/CI.
- [ ] Validar login real, refresh e logout.
- [ ] Validar Chat → API com backend executando.
- [ ] Confirmar comportamento em viewport móvel com teclado real.
- [ ] Corrigir/ajustar qualquer incompatibilidade de lint com Next.js 16.

## Próximo passo exato
Executar a jornada login → Chat → API → resposta → logout e registrar evidências reais.

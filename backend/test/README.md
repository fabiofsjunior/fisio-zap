# Backend tests

Os testes de API executam o app real de `src/index.js` com a validação do token Supabase injetada para isolamento do ambiente de CI. A validação contra Supabase real ocorre separadamente no smoke test autenticado.

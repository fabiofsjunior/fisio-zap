# Regras do agente para Supabase

Estas instruções têm escopo para todo o diretório `supabase/`.

## Migrations

- Use PostgreSQL válido e mantenha as migrations reproduzíveis.
- Blocos anônimos PL/pgSQL devem usar `do $$ ... begin ... end $$;`.
- **Nunca** escrever `do $` ou `end $`.
- Se usar dollar-quoting nomeado, o mesmo delimitador completo deve abrir e fechar.
- Após qualquer alteração, faça replay de todas as migrations localmente antes de concluir.
- Valide também com o lint do schema.
- Erros do CI devem ser corrigidos na causa; não usar rerun como substituto de correção.

## RLS e segurança

- Toda tabela exposta deve ter RLS.
- UPDATE deve ter política SELECT compatível, além de `USING` e `WITH CHECK`.
- Não usar `auth.role()` para autorização.
- Não usar `raw_user_meta_data` para decisões de autorização.
- Functions `SECURITY DEFINER` somente quando realmente necessárias, preferencialmente em schema não exposto, com `search_path` seguro e privilégios revisados.

## Validação

Uma migration só está pronta quando o replay completo e o lint passam.

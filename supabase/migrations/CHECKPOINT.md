# Checkpoint — Banco de dados / migrations / RLS

**Responsável lógico:** especialista de banco/Supabase em conjunto com segurança.

## Execução — 06/10/2026
- Projeto Supabase real: `fisio-zap` / `myjbyxzxdrvzhqkvsggj`, região `sa-east-1`, PostgreSQL 17.
- RLS está habilitado nas tabelas expostas observadas.
- O banco remoto possui schema mais avançado que as migrations versionadas no repositório; existe drift que precisa ser reconciliado antes de declarar reprodutibilidade.
- O Security Advisor inicialmente encontrou 3 funções `SECURITY DEFINER` executáveis por `anon`/ `authenticated`.
- Foi aplicada a migration remota `20261006173915_harden_security_definer_functions`.
- As funções `is_org_member` e `is_org_admin` foram movidas para `private`, com execução apenas por `authenticated`; `handle_new_user` não é mais executável por `anon`/ `authenticated`.
- O Security Advisor foi executado novamente e retornou **zero lints**.
- A migration correspondente foi versionada em `supabase/migrations/20261006173915_harden_security_definer_functions.sql` na branch `TESTES`.

## Pendências críticas
- [ ] Reconciliar migrations do Git com o histórico/schema remoto.
- [ ] Criar e executar testes pgTAP/negativos para usuário A × usuário B.
- [ ] Confirmar grants por tabela e operação, além de RLS.
- [ ] Validar ambiente limpo reproduzindo o schema esperado.

## Próximo passo exato
Concluir a validação automatizada de RLS/isolation com dados fictícios e reconciliar o drift de migrations antes de conectar dados clínicos reais.

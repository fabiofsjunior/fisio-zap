# Checkpoint — Banco de dados / migrations / RLS

**Responsável lógico:** especialista de banco/Supabase em conjunto com segurança.

## Execução — 06/10/2026 — S1.5

### Auditoria remota
- Projeto Supabase real: `fisio-zap` / `myjbyxzxdrvzhqkvsggj`, PostgreSQL 17.
- RLS está habilitado nas tabelas expostas observadas.
- O remoto possui 14 tabelas de aplicação; existem dados somente em `profiles` (3), `organization_members` (3) e `organizations` (1) na estimativa observada.
- O histórico remoto contém as versões `20260910011948` e `20260910011957`; os arquivos versionados no Git usavam timestamps diferentes. Isso é **migration-history drift**.
- O schema remoto também está à frente das migrations Git: `patient_groups`, `clinical_notes`, `documents`, `skills` e `patient_protocols` não eram representados integralmente; a versão Git ainda tinha `evolutions` e colunas MVP antigas.
- O Security Advisor após o hardening remoto retornou **zero lints** para os achados de funções `SECURITY DEFINER`.
- Não foi executado `db reset --linked`: o remoto contém dados de contas/organização e a regra desta fase é não destruir dados.

### Alterações versionadas em TESTES
- `20261006173915_harden_security_definer_functions.sql` foi tornado replay-safe: não assume que assinaturas históricas já existam.
- `20261006180000_reconcile_supabase_schema.sql` foi criada como reconciliação **aditiva e não destrutiva**.
- `20261006190000_finalize_schema_reconciliation.sql` foi adicionada para normalizar o status de `appointments`, fechar a política RLS de `patient_groups` e criar índices para as FKs relevantes.
- A migration adiciona tipos, tabelas/colunas/índices ausentes, funções privadas e políticas explícitas para `authenticated`, além de retirar acesso Data API de `anon`.
- Colunas legadas não são removidas nesta primeira reconciliação quando a remoção poderia descartar dados. Elas ficam documentadas como drift residual para uma limpeza posterior, somente após prova de equivalência/migração de dados.
- O workflow de TESTES agora inicializa um Supabase local, aplica todas as migrations, faz lint do schema e falha se houver erro.

### Pendências para declarar S1.5 concluída
- [ ] CI executar com sucesso `supabase db reset --local`.
- [ ] CI executar lint sem erros.
- [ ] Executar `test:smoke` e `test:rls` contra o ambiente de teste.
- [ ] Confirmar migration history remoto × Git sem divergência.
- [ ] Se ainda houver drift legado, produzir uma segunda migration somente para objetos/colunas cuja remoção seja comprovadamente segura.

## Regra de segurança
Nenhum `db reset --linked`, `DROP TABLE` destrutivo ou alteração remota de dados foi executado nesta fase.

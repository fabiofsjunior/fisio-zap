# Checkpoint — Banco de dados / migrations / RLS

**Responsável lógico:** especialista de banco/Supabase em conjunto com segurança.  
**Skills obrigatórias:**  
- `skills://plugins/supabase/supabase/skill.md`
- `skills://plugins/vibe-code-security-reviewer/supabase-rls-security/skill.md`
- `skills://plugins/vibe-code-security-reviewer/threat-modeling/skill.md`

Leia `../../CHECKPOINT.md`, `../../docs/security.md` e `../../lib/supabase/CHECKPOINT.md`.

## Estado conhecido no último levantamento
- Existem migrations em `supabase/migrations/`, incluindo schema inicial e base do MVP.
- A migration do MVP define tabelas de organizações, membros, perfis, pacientes, agenda, evoluções, notificações, exercícios, protocolos e financeiro.
- A migration habilita RLS; isso, isoladamente, não prova que as policies estão corretas nem que as migrations foram aplicadas no ambiente.
- O estado do banco remoto deve ser conferido antes de qualquer alteração.

## Missão
1. revisar todas as migrations existentes e sua ordem;
2. confirmar que um ambiente limpo pode aplicar migrations de forma reproduzível;
3. verificar grants, RLS e policies para SELECT/INSERT/UPDATE/DELETE;
4. confirmar isolamento por organização e profissional em cada tabela relevante;
5. avaliar funções, views e possíveis caminhos de elevação de privilégio;
6. criar alterações apenas por novas migrations revisáveis;
7. preparar dados de demonstração estritamente fictícios e removíveis, se necessário.

## Regras
- Nunca executar mudanças destrutivas no banco de produção para facilitar o teste.
- Não inserir dados reais de pacientes para smoke tests.
- Não desabilitar RLS para “fazer funcionar”.
- Não considerar policy segura sem testar casos permitidos e negados.
- Mudanças de schema devem ser versionadas em SQL; nunca depender somente de cliques manuais no painel.
- Verificar se funções expostas concedem somente os privilégios necessários.
- Não colocar segredos nas migrations.

## Critérios de aceite
- [ ] Migrations aplicam em sequência num ambiente de teste.
- [ ] RLS está habilitada em todas as tabelas expostas.
- [ ] Testes negativos confirmam que usuário A não acessa dados de B.
- [ ] INSERT/UPDATE/DELETE respeitam organização e profissional, inclusive `WITH CHECK` quando aplicável.
- [ ] Nenhuma policy permite acesso amplo acidental.
- [ ] Resultado, comandos e limitações são registrados.

## Próximo passo
Ler integralmente as migrations existentes, mapear tabela → operações → policy, e validar o resultado no Supabase de teste. Não declarar seguro apenas por inspeção estática.

## Registro de execução
Agente: preencher ao trabalhar.  
Data: preencher ao trabalhar.  
Status: **pendente de validação por execução**.

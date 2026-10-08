# Checkpoint — Supabase / autenticação

**Responsável lógico:** especialista Supabase, banco e autenticação.  
**Skills obrigatórias:**  
- `skills://plugins/supabase/supabase/skill.md`
- `skills://plugins/vibe-code-security-reviewer/supabase-rls-security/skill.md`
- `skills://plugins/vibe-code-security-reviewer/authentication-and-authorization/skill.md`

Leia `../../CHECKPOINT.md`, `../../docs/security.md` e `../../supabase/migrations/CHECKPOINT.md`.

## Estado conhecido no último levantamento
- `server.ts` cria cliente server-side via `@supabase/ssr` e cookies do Next.js.
- `requireUser()` usa `auth.getUser()` e retorna usuário ou `null`.
- `lib/supabase/proxy.ts` atualiza a sessão e chama `auth.getClaims()`.
- Login do navegador usa `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Configuração real do projeto, callbacks, sessão/renovação e policies ainda exigem validação no ambiente. Não assumir que migrations foram aplicadas.

## Missão
1. conferir nomes e presença das variáveis exigidas sem exibir seus valores;
2. validar login, leitura de sessão, renovação, logout e rotas protegidas;
3. verificar configuração do proxy/middleware compatível com a versão instalada do Next.js;
4. conferir aplicação das migrations e RLS em todas as tabelas expostas;
5. testar isolamento entre dois usuários/organizações com dados fictícios;
6. orientar criação de usuário de teste sem armazenar senha em Git ou documentação pública;
7. documentar as URLs de callback necessárias para ambiente local e Vercel.

## Regras críticas
- Antes de qualquer tarefa Supabase, leia a Skill indicada acima.
- Não copiar valores secretos para respostas, logs, issues ou arquivos versionados.
- Nunca expor service-role key ao navegador.
- Não tratar login válido como autorização suficiente para todo registro: verificar organização, papel, profissional e recurso.
- Não usar `raw_user_meta_data` como fonte de autorização.
- Se isolamento/RLS não puderem ser comprovados, somente dados fictícios podem ser usados.
- Não alterar schema diretamente no painel sem registrar migration reproduzível.

## Critérios de aceite
- [ ] Variáveis necessárias presentes localmente, valores não expostos.
- [ ] Login/logout e sessão renovada testados.
- [ ] Rotas protegidas bloqueiam usuário sem sessão.
- [ ] Policies RLS foram inspecionadas e testadas, não apenas presumidas por existir migration.
- [ ] Usuário A não consegue consultar/modificar registros de B.
- [ ] Nenhuma credencial privilegiada está em código cliente ou Git.
- [ ] Resultado e bloqueios documentados com evidência de execução.

## Próximo passo
Auditar os arquivos de sessão e as migrations existentes; verificar o projeto Supabase real antes de concluir qualquer item. Corrigir em mudanças pequenas e reproduzíveis.

## Registro de execução
Agente: preencher ao trabalhar.  
Data: preencher ao trabalhar.  
Status: **pendente de validação por execução**.

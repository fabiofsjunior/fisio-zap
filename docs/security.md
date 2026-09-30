# FisioZap — Segurança e privacidade

## Princípios

1. Dados de pacientes são potencialmente sensíveis e devem receber proteção reforçada.
2. Nunca confiar no frontend para autorização.
3. Cada operação deve validar identidade, organização e escopo do recurso no servidor.
4. RLS é defesa obrigatória no banco e deve refletir o mesmo modelo de autorização.
5. Segredos não entram no Git.
6. `NEXT_PUBLIC_*` nunca pode conter service role keys, tokens privados ou credenciais.
7. A IA recebe somente o contexto mínimo necessário.
8. Conteúdo gerado por IA deve ser revisado pelo profissional antes de registros clínicos relevantes.
9. A IA não diagnostica nem decide tratamento.
10. Ações destrutivas ou sensíveis exigem confirmação explícita.
11. Logs não devem conter dados clínicos desnecessários.
12. Operações mutáveis/sensíveis devem possuir limites de requisição e validação de entrada.
13. Dependências devem ser fixadas e o lockfile versionado.
14. Mudanças de banco devem ser reproduzíveis por migrations revisadas.

## Modelo de autorização

Toda requisição autenticada deve estabelecer:

- identidade do usuário;
- organização ativa;
- papel/permissões;
- escopo profissional;
- recurso solicitado;
- ação permitida.

Nunca usar apenas `authenticated` como autorização. O backend deve rejeitar acesso fora do escopo mesmo que o identificador do recurso seja conhecido.

## Supabase

- RLS habilitado em todas as tabelas expostas.
- Policies devem restringir linhas por organização e responsabilidade.
- Não usar `raw_user_meta_data` para autorização.
- Service role somente em ambiente servidor confiável.
- UPDATE deve possuir `USING` e `WITH CHECK`.
- Views expostas devem usar `security_invoker` quando aplicável.
- Funções `SECURITY DEFINER` somente quando indispensáveis, isoladas e revisadas.

## Backend

- autenticação antes de operações protegidas;
- autorização por recurso;
- validação de payload;
- rate limiting por operação;
- mensagens de erro sem segredos ou dados clínicos;
- logs sem conteúdo clínico desnecessário;
- endpoints destrutivos com confirmação explícita.

## WhatsApp

O MVP não usa disparos automáticos como mecanismo de notificação. O WhatsApp funciona como interface de consulta, comando e registro.

A futura integração oficial deve manter a mesma camada de autorização do painel web e nunca assumir que o número de telefone, isoladamente, autoriza acesso a dados.

## IA

A IA é assistiva. Não diagnostica, não decide tratamento e não grava evolução clínica sem revisão/confirmacão do profissional.

O contexto enviado ao provedor deve ser mínimo e compatível com a finalidade da operação.

## Segredos

Nunca versionar:

- `.env.local`;
- tokens;
- chaves privadas;
- service role keys;
- credenciais do WhatsApp;
- chaves de provedores de IA.


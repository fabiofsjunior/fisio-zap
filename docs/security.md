# FisioZap — Segurança e privacidade

## Princípios

1. Dados de pacientes são potencialmente sensíveis e devem receber proteção reforçada.
2. Nunca confiar no frontend para autorização.
3. Cada operação deve validar identidade, organização, grupo e propriedade/escopo do recurso.
4. Segredos não entram no Git.
5. `.env.local` é local e ignorado pelo Git.
6. A IA recebe somente o contexto necessário.
7. Conteúdo gerado por IA deve ser revisado pelo profissional antes de registros clínicos relevantes.
8. A IA não diagnostica nem decide tratamento.
9. Ações destrutivas ou sensíveis exigem confirmação explícita.
10. Logs não devem conter dados clínicos desnecessários.

## WhatsApp

O MVP não usa disparos automáticos como mecanismo de notificação. O WhatsApp funciona como interface de consulta, comando e registro.

## Banco

Supabase RLS deve permanecer habilitado. Políticas precisam limitar acesso por organização e, para profissionais, por responsabilidade/escopo do paciente.

## Ambiente

Nunca versionar:
- `.env.local`;
- tokens;
- chaves privadas;
- service role keys;
- credenciais do WhatsApp;
- chaves de provedores de IA.

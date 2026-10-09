# Ambiente local

## Inicialização

Use:

```bash
npm run dev
```

O launcher procura automaticamente portas livres entre **3000 e 4000**. Ele reserva uma para o frontend e outra para o backend, inicia o backend primeiro, aguarda `/health`, inicia o Next.js e abre o frontend automaticamente no navegador.

As portas não são fixas e não devem ser assumidas por outras partes do sistema.

## Perfis de teste

Os scripts de bootstrap, criação de usuário e RLS aceitam somente Supabase local isolado. Configure no `.env.local` a URL HTTP `http://127.0.0.1:54321` (ou `localhost` / `[::1]`), as chaves do Supabase local e `FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS=true`. URLs remotas são recusadas antes de criar clientes, mesmo com opt-in. Não reutilize chaves ou dados de produção.

Depois de configurar `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente local, execute:

```bash
npm run bootstrap:test-accounts
```

O bootstrap cria/garante:

- **Admin** — role `owner`: todos os módulos liberados.
- **Teste** — role `professional`: somente os módulos definidos para profissional.

As credenciais padrão são apenas para o ambiente local/TESTES e podem ser sobrescritas por variáveis `FISIOZAP_*_EMAIL` e `FISIOZAP_*_PASSWORD`.

O `service_role` nunca deve ser colocado em uma variável `NEXT_PUBLIC_*` nem enviado ao navegador.

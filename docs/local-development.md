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


## Teste Android com ngrok — porta 3847

Atualize a branch `TESTES` e instale as dependências pela opção 1 do `FisioZap-Local.cmd`. Instale a CLI oficial ngrok no Windows e configure o authtoken no próprio computador, conforme o painel ngrok. Nunca compartilhe o token nem o coloque no Git. O launcher usa a configuração já instalada.

Abra o menu e selecione **15 — Testar APK com ngrok**, ou execute `npm run dev:tunnel`. O frontend escuta somente em `http://127.0.0.1:3847`; o backend em `http://127.0.0.1:3848`. Se uma porta estiver ocupada, encerre o processo que você iniciou nela e tente novamente; o launcher não troca essas portas.

O Supabase configurado precisa ser um ambiente de teste acessível por HTTPS pelo celular. `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` não funciona no APK externo; nessa configuração o launcher aborta. Esta entrega não cria um túnel para o banco local nem altera o projeto Supabase.

Copie o **link HTTPS exibido** para o APK debug. Um único túnel atende a interface e `/backend/*`, encaminhado pelo Next.js ao backend local. No celular não use `localhost`, IP HTTP, link da API separado ou o endereço de produção da Vercel. Mantenha o computador e o terminal ativos. CTRL+C encerra ngrok/frontend/backend. O domínio pode mudar ao reiniciar; nesse caso reabra o APK e informe o novo endereço.

O modo exige opt-in duplo do launcher (`FISIOZAP_LOCAL_TUNNEL=true` e `FISIOZAP_TUNNEL_RUNTIME=local-build`). Ele compila e serve um build local com `next start`, sem expor HMR, overlays ou servidor `next dev`. Aguarde a compilação antes de abrir o APK. Não abre túneis no `npm run dev` normal, não altera o site Vercel, não aplica migrations e não configura credenciais remotas. Ferramentas administrativas `/api/test/users` e `/api/test/diagnostics` ficam bloqueadas no túnel. Login, permissões e isolamento do servidor continuam necessários. Use contas e dados fictícios; ações normais da interface usam o Supabase já configurado em `.env.local`. A inspeção de requisições do ngrok fica desativada.

Se ngrok exibir sua tela gratuita de aviso, toque em **Visit Site** para continuar. Se houver erro de instalação/autenticação, ajuste a CLI local conforme a mensagem genérica e o painel oficial; o launcher não imprime logs brutos nem authtoken. Não há ngrok instalado neste ambiente de revisão: abertura real do túnel e homologação do APK dependem do computador do proprietário.

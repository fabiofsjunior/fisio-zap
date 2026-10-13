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

A opção 15 atualiza as dependências antes de iniciar: `npm ci --include=dev` na raiz e `npm install --include=dev` no backend (que ainda não possui lockfile). Isso inclui `jsdom`, `@testing-library/react` e os tipos usados na verificação TypeScript dos testes pelo build. Uma falha na instalação interrompe o fluxo antes de abrir ngrok. Para executar diretamente no terminal, atualize as dependências com esses comandos antes de `npm run dev:tunnel`; não use uma instalação que omita dependências de desenvolvimento para compilar localmente.

Se aparecer `TS2307: Cannot find module 'jsdom'` ou `@testing-library/react`, a compilação não terminou e o aplicativo ainda não está pronto para acesso. Execute `npm ci --include=dev` na raiz e reinicie a opção 15. Não ignore erros de TypeScript. O aviso gratuito **Visit Site** é uma etapa separada: toque nele somente depois de o launcher terminar de iniciar e exibir o link HTTPS.

O Supabase configurado precisa ser um ambiente de teste acessível por HTTPS pelo celular. `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` não funciona no APK externo; nessa configuração o launcher aborta. Esta entrega não cria um túnel para o banco local nem altera o projeto Supabase.

Copie o **link HTTPS exibido** para o APK debug. Um único túnel atende a interface e `/backend/*`, encaminhado pelo Next.js ao backend local. No celular não use `localhost`, IP HTTP, link da API separado ou o endereço de produção da Vercel. Mantenha o computador e o terminal ativos. CTRL+C encerra ngrok/frontend/backend. O domínio pode mudar ao reiniciar; nesse caso reabra o APK e informe o novo endereço.

O APK debug 0.1.1 abre diretamente `https://oxygen-nag-jolly.ngrok-free.dev/login`, sem pedir endereço na inicialização. Se o domínio do túnel mudar, use o menu nativo de recuperação **Alterar endereço do aplicativo**. O endereço padrão é apenas de homologação, não o endereço de um APK release.

## Login e smoke no túnel

Mantenha a opção 15 em execução e abra uma segunda janela do menu. Escolha **16 — Validar login e smoke do túnel**, ou execute `npm run test:smoke:tunnel`. Esse modo usa o frontend HTTP local 3847 e o backend 3848, autentica a conta TESTE e, quando configurada, a ADMIN, e verifica o contrato atual do chat (`read_only`). Ele não imprime credenciais nem o conteúdo da resposta do chat e não cria ou redefine contas.

`FISIOZAP_TEST_EMAIL/PASSWORD` e `FISIOZAP_ADMIN_EMAIL/PASSWORD` são credenciais fornecidas aos testes. Defini-las no `.env.local` não cria esses usuários no projeto indicado em `NEXT_PUBLIC_SUPABASE_URL`. As contas precisam já existir nesse mesmo projeto, com e-mail confirmado quando exigido e vínculo à organização para usar o chat. Credenciais inválidas, e-mail não confirmado e falhas de rede/configuração recebem diagnósticos distintos. Não compartilhe valores de segredo ou o arquivo `.env.local`.

Os menus de criação/bootstrap/RLS continuam restritos ao Supabase local isolado. Eles não sincronizam automaticamente contas em um projeto remoto e não devem ser usados para contornar essa restrição. A recuperação ou configuração de contas do projeto de homologação deve ser realizada pelo proprietário no projeto correto.

O modo exige opt-in duplo do launcher (`FISIOZAP_LOCAL_TUNNEL=true` e `FISIOZAP_TUNNEL_RUNTIME=local-build`). Ele compila e serve um build local com `next start`, sem expor HMR, overlays ou servidor `next dev`. Aguarde a compilação antes de abrir o APK. Não abre túneis no `npm run dev` normal, não altera o site Vercel, não aplica migrations e não configura credenciais remotas. Ferramentas administrativas `/api/test/users` e `/api/test/diagnostics` ficam bloqueadas no túnel. Login, permissões e isolamento do servidor continuam necessários. Use contas e dados fictícios; ações normais da interface usam o Supabase já configurado em `.env.local`. A inspeção de requisições do ngrok fica desativada.

Se ngrok exibir sua tela gratuita de aviso, toque em **Visit Site** para continuar. Se houver erro de instalação/autenticação, ajuste a CLI local conforme a mensagem genérica e o painel oficial; o launcher não imprime logs brutos nem authtoken. Não há ngrok instalado neste ambiente de revisão: abertura real do túnel e homologação do APK dependem do computador do proprietário.

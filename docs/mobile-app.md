# S11.1 — FisioZap para Android

Issue #36. Branch `feature/android-chat-bootstrap` → `TESTES`. Homologação em aparelho real pendente.

## Canal definido pelo proprietário

A interação será pelo Chat do próprio aplicativo Android, com experiência semelhante a uma conversa no WhatsApp. Não há conexão com WhatsApp, número vinculado, QR Code ou envio de mensagens externas nesta etapa. A integração externa prevista na S8 fica pendente de reavaliação.

## Arquitetura

O APK usa uma WebView Android para abrir o frontend Next.js existente. Chat, pacientes, agenda, evoluções e financeiro continuam na mesma aplicação web; autenticação, autorização e regras de negócio permanecem no backend/Supabase. Não existe um segundo frontend ou lógica clínica no APK.

O documento anterior previa avaliar Capacitor. Para esta entrega foi escolhido um wrapper Kotlin pequeno com controles nativos de navegação e mídia. A base web permanece preservada. Esta escolha não implica migração para React Native nem armazenamento de registros clínicos no aparelho.

## Endereço do aplicativo

O aplicativo precisa de endereço HTTPS válido e acessível. O debug permite configurar esse endereço; o release requer endereço fixo na compilação pela propriedade Gradle `WEB_APP_URL`. URLs HTTP, `file:`, `data:` e certificados TLS inválidos não são aceitos. Não desative a validação TLS para testar.

O APK mostra a versão publicada no endereço configurado. Empacotar não publica automaticamente `TESTES`: o site atualmente em `main` pode ter funcionalidades anteriores. Para homologar o Chat recente, use um host HTTPS autorizado. Não ativar Vercel Preview nem promover `main` como atalho. O app não leva servidor ou banco embutido e não funciona como aplicação clínica offline.

## Segurança e mídia

- Login e logout usam o fluxo web existente. Não embutir `service_role`, chaves de IA, senhas ou tokens no APK/Gradle.
- Navegação interna restrita à origem HTTPS configurada. Links externos seguem para o navegador; esquemas arbitrários são bloqueados.
- Microfone exige origem confiável, solicitação da página e permissão Android. Câmera e permissões amplas de armazenamento não fazem parte desta entrega.
- Anexos são escolhidos pelo seletor Android. O backend continua responsável por validar tipo, tamanho e autorização.
- Transcrição S7.4 permanece opcional e desativada por padrão no backend; exige chave própria, opt-in e confirmação antes do envio ao provedor.
- Depuração WebView somente em debug; backups desativados. Falhas TLS são bloqueadas e erros não exibem conteúdo clínico.

## Build e APK

O workflow Android executa testes unitários e `assembleDebug`, publicando o APK como artefato do GitHub Actions. Consulte as instruções e versões do SDK/Gradle em `mobile/android/README.md`. Não há assinatura de produção ou publicação em loja nesta etapa.

## Homologação no celular

1. Instale o APK debug do CI Android e configure o endereço HTTPS de homologação.
2. Faça login com conta de teste. No Chat, confira agenda, pendências e resumo financeiro com dados fictícios, respeitando o perfil.
3. Grave, pare, ouça e envie áudio fictício. Negue o microfone e confirme erro compreensível sem bloquear o texto.
4. Selecione áudio, PDF e imagem. Confira limites, cancelamento e preservação do rascunho.
5. Teste download dos anexos, botão Voltar, teclado, rotação, perda de rede e retorno ao app.
6. Faça logout: acesso protegido deve exigir login novamente. Teste expiração/renovação da sessão.
7. Teste link externo e URL inválida: não devem assumir a sessão interna nem receber permissão de microfone.

Testes unitários e build do APK não substituem testes no dispositivo. Push nativo, login Google nativo e cache offline de dados clínicos ficam para entregas posteriores.

A ponte de download aceita mensagens somente da origem HTTPS configurada e do frame principal. O handler web exige clique real, mas a API nativa não comprova gesto do usuário: scripts dessa origem podem solicitar o diálogo. A gravação exige escolha explícita no seletor do Android; não há download automático nem execução do arquivo.

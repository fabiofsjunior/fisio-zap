# S9.3 — Arquivo privado de documento profissional

Issue #44. Branch `feature/s9-private-document-files` → `TESTES`. Homologação no dispositivo e com usuários reais pendente.

Um registro de documento profissional S9.1 pode receber **um** PDF, JPEG ou PNG de até **5 MiB**. O arquivo fica no bucket privado `professional-documents`, com chave gerada pelo servidor a partir da organização e do identificador do registro. Não há link público, substituição nem exclusão nesta etapa. O conteúdo não vai para ferramentas de IA, chat ou notificações. Não anexe documentos clínicos ou de pacientes.

As rotas `POST /professional-documents/:id/file` e `GET /professional-documents/:id/file` exigem JWT e organização válida e buscam o registro pela autorização existente. O upload recebe bytes brutos, `Content-Type` e `X-FisioZap-File-Name` codificado; valida extensão, MIME, assinatura e tamanho antes de gravar no bucket com um cliente privilegiado **exclusivo do backend**. O download usa o JWT do usuário e responde como anexo com `nosniff` e `no-store`. A policy SELECT do Storage confere a chave exata com o registro e a permissão de leitura S9.1. Clientes autenticados não podem gravar objetos diretamente; não há policy de INSERT, UPDATE ou DELETE para eles. O teste de CI com serviço Storage ativo guarda `service_role` apenas no backend e na preparação/limpeza de fixtures **locais**, protegido por `FISIOZAP_ALLOW_LOCAL_TEST_MUTATIONS=true` e URL de loopback; chamadas sob teste usam JWT de contas fictícias.

A UI não mantém um marcador separado no banco para a presença do arquivo: Storage é a fonte de verdade. O usuário pode tentar baixar; se ainda não houver anexo, a API devolve 404. Se já houver, um novo upload retorna 409 sem substituir o objeto.

## Homologação

Em ambiente de teste com migrations S9.1/S9.3, use contas fictícias: anexe e baixe um PDF, uma imagem JPEG e uma PNG; recarregue a página e baixe novamente. Teste arquivo maior que 5 MiB, tipo/extensão/assinatura inválidos, falha de rede, segundo upload, sessão expirada, colega da mesma organização, gestor e outra organização. A etapa não aplica migrations em banco remoto nem ativa Vercel Preview.

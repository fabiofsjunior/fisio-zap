# S10.3 — Paginação e permissões da equipe

Issue #50. Branch `feature/s10-team-pagination` → `TESTES`. Homologação funcional do proprietário pendente.

O diretório carrega 50 membros por página e permite consultar as páginas seguintes. A consulta usa cursor por `user_id` em ordem crescente, com no máximo 100 membros por requisição. A ordem por identificador mantém o cursor estável quando o nome de uma pessoa muda. A lista mostra quantas pessoas já foram carregadas; isso não representa o total da organização.

O proprietário canônico, definido em `organizations.owner_id` e com vínculo `owner`, recebe a permissão de editar funções. Outros vínculos `owner` e os coordenadores podem consultar a equipe, mas não recebem os controles de edição. A RPC de alteração da S10.2 continua revalidando a autorização no banco a cada escrita.

## API

`GET /team/members?limit=50&cursor=<uuid>` exige JWT e a organização selecionada pelo header `X-FisioZap-Organization-Id`. `limit` é opcional, entre 1 e 100; `cursor` é opcional e deve ser UUID. A resposta contém somente `members` (identificador, nome de exibição e papel), `next_cursor` e `can_manage_roles`. Sem continuação, `next_cursor` é `null`.

A RPC `public.s10_team_directory_page(target_org, after_user, page_size)` revalida o vínculo owner/coordinator na organização, limita a leitura a uma página mais um registro de continuação e não retorna contatos ou conteúdo clínico. A RPC anterior continua disponível para compatibilidade. Não há novos grants de escrita ou alterações nas policies de dados clínicos.

## Interface e recuperação

“Carregar mais” acrescenta membros sem repetir identificadores. Falha de uma página mantém a lista já carregada e permite tentar novamente. A troca de organização limpa a lista, os rascunhos de função e o cursor; respostas antigas não podem modificar a nova organização. Uma alteração de função bem-sucedida recarrega a primeira página e a permissão de edição.

## Aceite e homologação

Usar somente contas fictícias e Supabase local com replay das migrations. Criar mais de 200 membros e conferir que todas as páginas são acessíveis sem duplicação. Testar página final, lista vazia, falha de rede na continuação, nova tentativa e troca de organização durante requisição. O proprietário canônico edita; outro vínculo owner e coordinator apenas consultam; professional/administrative e membros de outra organização são recusados. Confirmar que alterar nomes não altera a posição no cursor e que os papéis owner continuam imutáveis.

Os testes automatizados cobrem o contrato da API, a interface montada e a RPC/grants no pgTAP. O CI usa Supabase local para replay, lint, pgTAP e RLS. Não aplicar migrations em banco remoto nesta entrega.

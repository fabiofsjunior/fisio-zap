# S10.2 — Papéis da equipe

Issue #48. Branch `feature/s10-member-roles` → `TESTES`. Homologação funcional do proprietário pendente.

O owner pode alterar o papel de um membro **existente** da própria organização entre profissional, coordenador e administrativo. A ação pede confirmação e atualiza o diretório após sucesso. O coordenador continua com consulta somente leitura. A API valida a sessão, a organização selecionada, o papel do solicitante, o identificador do alvo e o novo papel. A função SQL também confere identidade, vínculo e organização antes de gravar.

O papel owner não pode ser atribuído, rebaixado ou removido nesta etapa. A transferência de propriedade exigirá um fluxo próprio para manter `organizations.owner_id` coerente. Convites, exclusão de membros, dados de contato, acesso clínico e reassociação de pacientes não fazem parte desta entrega. A lista atual mostra até 200 membros; equipes maiores precisarão de paginação para gerenciar todos.

A alteração exige que o solicitante seja o proprietário canônico (`organizations.owner_id`) e tenha vínculo `owner`. A S10.3 alinha os controles da interface a essa autorização e permite consultar todos os membros por páginas; veja `docs/S10-PAGINACAO-EQUIPE.md`. A transferência de propriedade permanece fora do escopo.

## Homologação

Em ambiente de teste com migrations S10.1/S10.2, use contas fictícias em duas organizações. Como owner, altere um membro entre os três papéis permitidos, recarregue a lista e confira persistência. Cancele uma alteração antes de salvar e simule falha de rede. Confira que coordinator, professional e administrative não conseguem alterar papéis nem pela API; um membro de outra organização não pode ser modificado, e o owner permanece owner. Não aplicar migrations em banco remoto nesta entrega.

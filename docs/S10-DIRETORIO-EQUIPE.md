# S10.1 — Diretório de equipe

Issue #46. Branch `feature/s10-team-directory` → `TESTES`. Homologação funcional do proprietário pendente.

Esta etapa apresenta, em modo somente leitura, até 200 membros da organização selecionada para **owner** e **coordinator**. Cada linha mostra apenas nome de exibição, papel e identificador do usuário. O nome pode estar ausente se o membro ainda não completou o perfil. Organizações com mais de 200 membros precisarão de paginação em uma etapa futura. O diretório não apresenta e-mail, telefone, registro profissional, dados clínicos ou credenciais.

A S10.3 substitui o limite da interface por páginas consultáveis e mantém o mesmo escopo de leitura. Consulte `docs/S10-PAGINACAO-EQUIPE.md` para o contrato atual e a homologação das páginas.

A API exige JWT e seleciona a organização pela membership validada, inclusive quando o cabeçalho `X-FisioZap-Organization-Id` é informado. A consulta ao banco deve limitar a função de diretório a owner/coordinator e à organização solicitada; a interface só exibe o módulo para esses papéis. Professional e administrative não têm acesso nesta etapa. Convites, criação ou remoção de membros, troca de papel e atribuição de pacientes ficam fora do escopo.

## Homologação

Em um ambiente de teste com a migration S10.1 aplicada, use contas fictícias de owner, coordinator, professional e administrative em pelo menos duas organizações. Confira a lista e os nomes visíveis para owner/coordinator, ausência de dados de contato, acesso negado aos demais papéis, isolamento entre organizações, lista vazia e falha temporária de rede. Ao trocar de organização, confirme que uma resposta antiga não aparece na nova lista. Não aplicar a migration em banco remoto nesta entrega.

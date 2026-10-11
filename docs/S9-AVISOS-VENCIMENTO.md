# S9.2 — Avisos de vencimento na central

Issue #42. Branch `feature/s9-document-expiry-alerts` → `TESTES`. Homologação funcional pendente.

A central de notificações consulta `GET /notifications/upcoming-documents` e mostra, quando aberta, documentos profissionais próprios vencidos ou com vencimento até 30 dias à frente. A data civil de referência é UTC, em acordo com S9.1. São no máximo 50 vencidos recentes e 50 próximos; o retorno contém apenas identificador, nome, data de vencimento e estado. A consulta exige sessão, organização válida e `professional_id` do usuário, inclusive se ele tiver papel de gestão.

Esses avisos são **somente leitura e informativos**: não criam tarefas, não disparam push, e-mail ou mensagem, nem garantem entrega fora da tela. Arquivados ou sem vencimento não aparecem. A central mantém tarefas e agenda independentes se essa consulta falhar.

## Homologação local

Com dados fictícios e migration S9.1 aplicada apenas em ambiente de teste, abra a central e verifique documentos próprios vencidos, vencendo hoje, em 30 dias e em 31 dias. Confira que só os três primeiros aparecem, que arquivados somem e que outro profissional/organização não vaza dados. Simule falha da API: a seção deve mostrar erro sem impedir o uso das tarefas e da agenda. Esta etapa não aplica migrations nem altera o banco remoto.

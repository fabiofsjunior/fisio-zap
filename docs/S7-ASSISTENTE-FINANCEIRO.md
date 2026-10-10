# S7.2 — Resumo financeiro no assistente

Issue #30. Entrega para `TESTES`; homologação funcional do proprietário pendente.

## Uso

No Chat, envie **Resumo financeiro deste mês**. O navegador envia o mês civil atual (`YYYY-MM`) junto à sessão e à organização selecionada. A API valida o mês; consultas diretas podem informar outro mês válido, sem interpretar datas livres na mensagem.

O resumo apresenta receitas e despesas pagas e pendentes, além do saldo realizado (receitas pagas menos despesas pagas), em reais. O período é a competência (`occurred_at`), não a data de pagamento ou vencimento. O saldo realizado corresponde aos lançamentos dessa competência que estão pagos.

Professional consulta seus próprios lançamentos. Owner, coordinator e administrative consultam os lançamentos da organização ativa, conforme o livro-caixa. A resposta identifica esse escopo.

## Limites

- Somente leitura, sem criação, pagamento ou exclusão pelo assistente.
- Sem nomes, pacientes, descrições de lançamentos ou conteúdo clínico.
- Sem provedor de IA externo ou armazenamento da conversa.
- Mês inválido e papel sem acesso são rejeitados antes da consulta financeira.
- Ao atingir 1.000 lançamentos, ou se a contagem exata não corresponder aos registros recebidos, o assistente recusa o resumo, sem publicar totais parciais. Use o módulo Financeiro para consultar os registros.
- Valores são somados em centavos; dados inválidos ou falha de consulta produzem erro seguro.

## Homologação local

1. Com dados fictícios, cadastre receita paga, receita pendente, despesa paga e despesa pendente na competência atual.
2. Pergunte pelo resumo no Chat e compare os totais e o saldo com o livro-caixa.
3. Confirme o resumo vazio em um mês sem lançamentos via API.
4. Teste professional com lançamentos de outro profissional e compare com owner na mesma organização.
5. Verifique que solicitações de escrita ou conteúdo clínico não realizam operações.

Manter as issues #25, #27 e #30 abertas até homologação. Nenhuma alteração em banco remoto é necessária para esta entrega.

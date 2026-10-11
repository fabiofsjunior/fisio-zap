# S9.1 — Documentos profissionais e vencimentos

Issue #40. Branch `feature/s9-professional-documents` → `TESTES`. Homologação funcional pendente.

Esta etapa registra **metadados** de documentos profissionais: nome, tipo (registro, certificado, licença ou outro), referência opcional, data de vencimento opcional e estado ativo/arquivado. O painel destaca os vencidos e os que vencem em até 30 dias. Não armazena arquivos, documentos de pacientes ou dados clínicos; não envia lembretes automáticos.

O frontend utiliza `GET/POST /professional-documents` e `PATCH /professional-documents/:id` com Bearer JWT e organização selecionada. A API deriva `expired` do vencimento; esse estado não é persistido. A criação usa o profissional autenticado. Profissionais acessam seus próprios registros; owner, coordinator e administrative podem consultar e atualizar os documentos da organização. O banco valida vínculo profissional/organização, RLS e grants por operação; não há DELETE para clientes autenticados.

## Homologação local

1. Em `TESTES`, execute o app local com Supabase de teste e contas fictícias; aplique migrations somente no ambiente local previsto pelo workflow. Não use documentos reais.
2. Cadastre registro sem vencimento, registro com vencimento futuro e um já vencido. Confira a lista e o resumo dos próximos 30 dias.
3. Arquive um documento vencido e reative-o; confirme o rótulo e o filtro.
4. Teste outra organização e outro profissional da mesma organização. Profissional comum só deve ver seus registros; papéis administrativos podem revisar a organização.
5. Teste data impossível, campos gerenciados pelo servidor, sessão expirada e falha de rede. A tela deve mostrar erro sem afirmar que salvou.

O CI executa replay de migrations, lint, pgTAP e testes RLS em Supabase local. A migration deste sprint **não foi aplicada ao Supabase remoto**. A issue permanece aberta até o proprietário confirmar o fluxo funcional.

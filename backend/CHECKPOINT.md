# Checkpoint — Backend / API

## Execução — 10/10/2026
- `GET /health` permanece público.
- `POST /chat` exige Bearer token Supabase e valida a organização ativa pela membership.
- S7.1 reconhece apenas consultas read-only de agenda do dia e pendências próprias; o backend só aceita o dia local atual segundo o relógio do servidor e respeita dias de 23/24/25 horas.
- Respostas trazem somente horários ou contagens, sem nomes, IDs, mensagens de tarefa ou conteúdo clínico. Solicitações não suportadas não consultam tabelas clínicas.
- Nenhum modelo/provedor externo, escrita de dados ou persistência de conversa foi adicionado.
- Payload validado: `message` obrigatório, máximo de 4.000 caracteres.
- Rate limit local: 30 requisições/minuto por IP.
- CORS restrito a `FRONTEND_ORIGIN`.
- Respostas operacionais são explicitamente `mode: "read_only"`.
- Testes cobrem escopo de organização/profissional, data atual com relógio determinístico, ranges passado/futuro, DST de 23/24/25 horas, limite final exclusivo, resultados vazios, tarefas próprias e fallback sem consultas clínicas.
- Workflow GitHub Actions criado para executar `npm test` em `TESTES`.

## Validação
- [x] 57 testes backend aprovados localmente; execução do harness requer loopback local.
- [x] CI da PR #28 e pós-merge #173 aprovados 4/4 (backend, web, database/pgTAP e RLS usando Supabase local).
- [ ] Teste manual com Supabase local e token válido pendente.
- [ ] Jornada ponta a ponta login → Chat → API → resposta → logout ainda pendente.

## Próximo passo exato
Homologação funcional local pelo proprietário: testar login → Chat → API, agenda do dia e pendências próprias. Manter a issue #27 aberta até a confirmação.

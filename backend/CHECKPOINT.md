# Checkpoint — Backend / API

## Execução — 06/10/2026
- `GET /health` permanece público.
- `POST /chat` implementado com Bearer token Supabase.
- Payload validado: `message` obrigatório, máximo de 4.000 caracteres.
- Rate limit local: 30 requisições/minuto por IP.
- CORS restrito a `FRONTEND_ORIGIN`.
- Resposta atual é explicitamente `mode: "demo"`; sem persistência e sem IA real.
- Smoke tests adicionados para health, autenticação, payload inválido, CORS e fluxo autenticado.
- Workflow GitHub Actions criado para executar `npm test` em `TESTES`.

## Validação
- [x] Casos de teste definidos e versionados.
- [ ] Execução do workflow/CI ainda pendente de resultado.
- [ ] Teste real com Supabase e token válido ainda pendente.
- [ ] Jornada ponta a ponta login → Chat → API → resposta → logout ainda pendente.

## Próximo passo exato
Executar o CI da branch `TESTES`, corrigir eventuais falhas e depois realizar smoke test com Supabase real antes de conectar IA.

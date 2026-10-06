# Checkpoint — Backend / API

## Execução — 06/10/2026
- `GET /health` permanece público.
- `POST /chat` foi implementado.
- Bearer token Supabase é validado no servidor; o backend deriva o usuário do token.
- Payload: `{ "message": string }`, máximo de 4.000 caracteres.
- Rate limit local: 30 requisições/minuto por IP.
- CORS restrito à `FRONTEND_ORIGIN`.
- Resposta atual usa `mode: "demo"` e não persiste dados nem chama IA real.
- O frontend usa `NEXT_PUBLIC_BACKEND_URL`; backend local usa porta 3001 por padrão.

## Pendências
- [ ] Executar testes reais de health, auth, payload inválido e rate limit.
- [ ] Validar CORS em origem permitida e negada.
- [ ] Adicionar testes automatizados mínimos antes de integrar IA real.

## Próximo passo exato
Rodar o backend localmente e executar a matriz de smoke tests; depois conectar uma resposta de IA server-side somente se o fluxo base estiver estável.

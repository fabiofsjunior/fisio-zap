# Checkpoint — Backend / API

**Responsável lógico:** engenheiro backend.  
**Skills obrigatórias:** `skills://plugins/vercel/create-a-backend/skill.md`, `skills://plugins/vibe-code-security-reviewer/api-abuse-and-misuse/skill.md`

## Estado atual
- `GET /health` permanece público e não expõe segredos.
- `POST /chat` exige `Authorization: Bearer <Supabase access token>`.
- O backend valida o token no Supabase e deriva a identidade do token; nenhum `user_id` do payload é aceito.
- Payload: `{ "message": string }`, obrigatório, máximo de 4.000 caracteres.
- Resposta de teste: `{ "message": string, "mode": "demo" }`.
- Rate limit local: 30 requisições/minuto por IP.
- CORS local restrito a `FRONTEND_ORIGIN` (padrão `http://localhost:3000`).
- A resposta de chat é explicitamente demonstrativa; ainda não existe persistência nem IA real.

## Critérios de aceite
- [x] `GET /health` retorna status saudável sem expor ambiente/segredos.
- [x] Requisições sem token para `/chat` recebem 401 por inspeção do código.
- [x] Payload inválido recebe 400/422 e não derruba o processo.
- [x] Erros internos retornam resposta genérica e são registrados sem dados sensíveis.
- [x] CORS permite apenas a origem configurada.
- [x] Contrato do Chat está definido e coincide com o frontend em desenvolvimento.
- [ ] Testes de execução real (health, auth, payload inválido e rate limit) ainda precisam ser executados no ambiente local.

## Próximo passo
Conectar o frontend ao `POST /chat` e executar a jornada login → Chat → API → resposta → logout.

# Checkpoint — Backend / API

**Responsável lógico:** engenheiro backend.  
**Skills obrigatórias:**  
- `skills://plugins/vercel/create-a-backend/skill.md`
- `skills://plugins/vibe-code-security-reviewer/api-abuse-and-misuse/skill.md`

Leia também `../CHECKPOINT.md`, `../docs/security.md` e o checkpoint do frontend.

## Estado conhecido no último levantamento
- Entrada: `backend/src/index.js`.
- Express com `express.json({ limit: '1mb' })` e rota `GET /health`.
- Ainda não foi confirmada uma rota de chat implementada.
- Dependências atuais incluem Express, dotenv e Supabase JS.
- Não assumir autenticação, CORS restrito, rate limiting ou integração de IA já implementados.

## Missão
Construir uma API mínima e segura para o teste integrado:
1. manter `GET /health` como diagnóstico sem dados sensíveis;
2. acordar com frontend o contrato de envio/retorno do Chat antes de implementar;
3. validar formato e tamanho de payloads;
4. autenticar requisições protegidas verificando token/sessão no servidor;
5. derivar identidade do usuário da credencial validada, nunca de um `user_id` fornecido pelo cliente;
6. restringir CORS às origens configuradas;
7. retornar códigos HTTP previsíveis e mensagens seguras;
8. preparar integração de IA apenas com credenciais server-side e fallback identificado.

## Regras de segurança
- Nunca registrar tokens, segredos ou texto clínico completo em logs.
- Nunca enviar stack trace ao cliente.
- Não usar service-role para contornar autorização sem uma justificativa e controles documentados.
- Validar autenticação e escopo antes de qualquer acesso a dados de pacientes.
- Aplicar limites de requisição e validação de entrada apropriados.
- Usar apenas dados fictícios até que RLS e isolamento tenham sido comprovados.
- Não diagnosticar nem decidir tratamento; sugestões clínicas exigem revisão do profissional.

## Critérios de aceite
- [ ] `GET /health` retorna status saudável sem expor ambiente/segredos.
- [ ] Requisições sem token para rotas protegidas recebem 401.
- [ ] Payload inválido recebe 400/422 e não derruba o processo.
- [ ] Erros internos retornam resposta genérica e são registrados sem dados sensíveis.
- [ ] CORS permite apenas origens configuradas.
- [ ] O contrato do Chat está documentado e coincide com o frontend.
- [ ] Testes de sucesso, erro, token ausente/inválido e payload inválido foram executados.
- [ ] Comandos de execução e resultados registrados.

## Próximo passo
Documentar o contrato da rota de Chat e implementar primeiro o caminho de teste mais simples e seguro, sem inventar persistência ou IA real. Atualize este checkpoint com endpoints e payloads exatos quando definidos.

## Registro de execução
Agente: preencher ao trabalhar.  
Data: preencher ao trabalhar.  
Status: **pendente de validação por execução**.

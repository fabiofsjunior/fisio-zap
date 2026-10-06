# FisioZap — Checkpoint global para agentes

**Branch obrigatória:** `TESTES`  
**Estado:** MVP em integração; consultar o estado real do código antes de assumir qualquer entrega concluída.  
**Objetivo prioritário:** permitir teste web integrado; avaliar APK somente depois que frontend, autenticação e API estiverem estáveis.

## Antes de começar — obrigatório
1. Leia este arquivo e `docs/equipe-desenvolvimento-roadmap.md`.
2. Leia o `CHECKPOINT.md` do módulo que irá alterar e as referências/Skills indicadas nele.
3. Confirme a branch atual e o estado do repositório. Todo desenvolvimento ocorre em `TESTES`; não faça commits nem alterações diretas em `main`.
4. Inspecione o código atual antes de editar. Não assuma que tarefas documentadas já foram implementadas.
5. Preserve mudanças de outros agentes. Faça alterações pequenas, verificáveis e compatíveis com os contratos documentados.

## Mapa dos módulos
- Frontend / rotas / experiência do app: [`app/CHECKPOINT.md`](app/CHECKPOINT.md)
- API Express: [`backend/CHECKPOINT.md`](backend/CHECKPOINT.md)
- Cliente Supabase e sessão server-side: [`lib/supabase/CHECKPOINT.md`](lib/supabase/CHECKPOINT.md)
- Schema, RLS e migrations: [`supabase/migrations/CHECKPOINT.md`](supabase/migrations/CHECKPOINT.md)
- Documentação, roadmap e entrega: [`docs/CHECKPOINT.md`](docs/CHECKPOINT.md)
- App Android: ainda não existe módulo nativo confirmado; siga `docs/mobile-app.md` antes de propor sua criação.

## Ordem de trabalho recomendada
1. Confirmar configuração local sem expor segredos.
2. Validar autenticação, sessão e proteção de rotas.
3. Implementar a navegação principal com abas **Chat** e **Painel**.
4. Integrar frontend e API usando contrato explícito, validação e autenticação.
5. Validar Supabase, migrations e RLS com usuários/dados fictícios.
6. Executar lint/typecheck/build e roteiro de fumaça; registrar resultados reais.
7. Avaliar Capacitor/APK somente se os critérios web estiverem atendidos.

## Contratos e limites
- O produto principal é o app FisioZap: **Chat** e **Painel** dentro do próprio frontend. WhatsApp não é a interface primária do MVP.
- O frontend não é autoridade de autorização. O backend/banco devem validar identidade e escopo.
- Nunca confiar em `user_id` enviado pelo navegador como prova de identidade.
- Nunca expor service-role key, tokens ou segredos em código, logs, frontend, APK ou Git.
- Use somente dados fictícios enquanto isolamento e RLS não forem comprovados.
- A IA pode ajudar a preparar rascunhos; não diagnostica, não decide tratamento e não grava evolução clínica sem revisão e confirmação do fisioterapeuta.
- Não afirmar que uma funcionalidade, teste, deploy ou APK está pronto sem evidência verificável.

## Ao concluir uma tarefa
Atualize o checkpoint do seu módulo com:
- status: concluído / parcial / bloqueado;
- arquivos alterados;
- decisões e contratos adicionados;
- comandos/testes realmente executados e seus resultados;
- riscos/bloqueios restantes;
- próximo passo exato, sem declarar como concluído o que não foi validado.

**Critério global de conclusão:** o caminho login → Chat/Painel → chamada de API (ou fallback explicitamente identificado) funciona, a build web passa e os limites de segurança são respeitados. APK é um objetivo condicional, não motivo para comprometer o teste web.

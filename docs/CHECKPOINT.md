# Checkpoint — Documentação / roadmap / release

**Responsável lógico:** líder técnico, QA e DevOps.  
**Skills recomendadas:**  
- `skills://plugins/vercel/verification/skill.md`
- `skills://plugins/vercel/deployments-cicd/skill.md`
- `skills://plugins/vibe-code-security-reviewer/threat-modeling/skill.md`

Leia `../CHECKPOINT.md`, `equipe-desenvolvimento-roadmap.md`, `mvp.md`, `security.md` e `mobile-app.md`.

## Missão
Manter uma fonte confiável sobre estado real do produto e facilitar a transferência entre agentes:
1. atualizar o roadmap quando uma tarefa mudar de estado;
2. registrar comandos executados e resultados observados;
3. separar claramente implementado, em andamento, bloqueado e planejado;
4. documentar contratos de API, variáveis de ambiente por nome (nunca seus valores), setup e troubleshooting;
5. manter os passos de teste local reproduzíveis;
6. documentar riscos e decisões de release;
7. atualizar documentação mobile apenas quando houver mudança real no caminho Android.

## Regras
- Não marcar uma tarefa como concluída com base apenas em leitura do código.
- Não declarar build, testes, deploy ou APK aprovado sem execução verificável.
- Não registrar credenciais, tokens, dados clínicos ou senhas.
- Não mudar a regra atual de deploy automático: somente `main`; testes de `TESTES` devem ser locais ou preview manual autorizado.
- Não misturar código de aplicação com documentação de checkpoint.
- Manter links relativos válidos e apontar para o checkpoint do módulo relevante.

## Critérios de aceite
- [ ] O roadmap reflete o estado observado mais recente.
- [ ] Cada módulo informa próximo passo e bloqueios.
- [ ] Comandos de teste correspondem aos scripts reais no `package.json`.
- [ ] Evidências e limitações estão explícitas.
- [ ] Instruções não exigem segredos versionados.

## Próximo passo
Depois de cada entrega de módulo, atualizar o roadmap com status e evidência real; se houver bloqueio, escrever a ação concreta necessária para desbloqueá-lo.

## Registro de execução
Agente: preencher ao trabalhar.  
Data: preencher ao trabalhar.  
Status: **pendente de validação por execução**.

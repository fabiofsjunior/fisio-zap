# S3 — Agenda e Rotina: plano de execução

Base: S2 aprovada e integrada na main (PR #7, commit f4b7ef24).

## Frentes de trabalho
- [#8](https://github.com/fabiofsjunior/fisio-zap/issues/8) — S3.1: dados, integridade e RLS (primeiro)
- [#9](https://github.com/fabiofsjunior/fisio-zap/issues/9) — S3.2: API e testes (depende de S3.1)
- [#10](https://github.com/fabiofsjunior/fisio-zap/issues/10) — S3.3: interface e UX (depende do contrato S3.2)
- [#11](https://github.com/fabiofsjunior/fisio-zap/issues/11) — S3.4: integração, regressão e evidências (último)

## Contrato funcional inicial
Cada agendamento deve identificar organização, paciente e profissional responsável, intervalo de tempo e status. Estados: agendado, confirmado, concluído, cancelado, falta e reagendado. Organização sempre deriva da associação autenticada; jamais confiar em organization_id vindo do cliente. Acesso sujeito a RLS, com testes negativos. Definir comportamento para fusos horários, intervalos sobrepostos e atualização concorrente antes de liberar a API.

## Critérios para PR pronta para merge
1. Migrations reproduzíveis em Supabase local e lint sem erros.
2. RLS verificada para leitura, criação, atualização e exclusão entre organizações.
3. API autenticada e testes de horários, validações, status e conflito.
4. Frontend responsivo com estados vazios, loading e erros; acessibilidade básica.
5. Testes de regressão S2 e todos os jobs CI verdes no commit HEAD.
6. Revisão de segurança e evidências anexadas à PR.
7. Sem alteração direta na main; merge somente após validação.

## Recuperação de falhas
Quando uma frente falhar, coletar logs, identificar causa específica, registrar o bloqueio na issue e transferir o escopo a outro executor; não contornar testes nem repetir CI sem mudança justificada.

## Checkpoint
- [x] S2 integrada na main.
- [x] Branch de S3 criada.
- [x] Escopo separado em quatro issues.
- [ ] S3.1 schema e RLS implementados.
- [ ] S3.2 API implementada.
- [ ] S3.3 frontend implementado.
- [ ] S3.4 CI e QA aprovados.
- [ ] PR pronta para merge.

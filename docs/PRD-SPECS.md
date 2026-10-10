# FisioZap — PRD / Product Specifications

**Documento:** PRD + Product Specifications  
**Versão:** 1.0  
**Data:** 06/10/2026  
**Status:** Baseline de produto para desenvolvimento  
**Branch de trabalho:** `TESTES`  
**Branch estável:** `main`

> Este documento é a fonte de verdade do produto. Ele define **o que o FisioZap deve fazer, para quem, por quê e quais critérios determinam que uma entrega está pronta**. Detalhes de implementação devem permanecer em documentação técnica própria.

---

## 1. Visão

O **FisioZap** é uma plataforma de gestão e assistência para fisioterapeutas, inicialmente focada em profissionais autônomos e de atendimento domiciliar.

O produto deve reduzir o trabalho operacional e organizar, em um único fluxo, **rotina, pacientes, agenda, atendimentos, evolução clínica, exercícios/protocolos, notificações e financeiro**, usando uma interface web/mobile-first e, progressivamente, um assistente conversacional.

### Proposta de valor

> **O fisioterapeuta cuida do paciente; o FisioZap cuida da organização da operação.**

O sistema deve transformar a rotina em um fluxo simples:

**Hoje → Pacientes → Atendimento → Evolução → Pendências → Financeiro**

A IA é assistiva. Ela não substitui o julgamento profissional nem deve publicar informação clínica definitiva sem confirmação do fisioterapeuta.

---

## 2. Problema

O fisioterapeuta autônomo precisa administrar simultaneamente:

- pacientes e seus dados;
- agenda e deslocamentos;
- rotina diária;
- registros de atendimento;
- evolução clínica;
- exercícios e protocolos;
- documentos e vencimentos;
- recebimentos e despesas;
- pendências administrativas;
- comunicação e consultas rápidas.

Essas atividades frequentemente ficam distribuídas entre WhatsApp, agenda, planilhas, documentos e memória pessoal.

O FisioZap deve consolidar essa operação sem transformar o profissional em operador de um sistema complexo.

---

## 3. Público-alvo

### 3.1 Primário — MVP

**Fisioterapeuta autônomo**, especialmente:

- atendimento domiciliar;
- atendimento particular;
- profissional que administra sozinho sua rotina;
- profissional que precisa de acesso rápido pelo celular.

### 3.2 Secundário — evolução

- profissionais cooperados;
- pequenas equipes;
- coordenadores;
- administrativos;
- clínicas;
- grupos especializados.

### 3.3 Fora do foco inicial

- paciente como usuário principal;
- marketplace;
- ERP completo de clínica;
- sistema hospitalar;
- diagnóstico automatizado;
- plataforma de disparo em massa.

---

## 4. Objetivos do produto

### Objetivos principais

1. Centralizar a operação diária do fisioterapeuta.
2. Reduzir tarefas administrativas repetitivas.
3. Tornar pacientes e agenda rapidamente acessíveis.
4. Organizar registros e evolução dos atendimentos.
5. Transformar pendências em uma rotina clara.
6. Permitir interação conversacional segura.
7. Preparar o produto para equipes sem criar uma segunda regra de negócio.
8. Construir a base de segurança antes do uso de dados clínicos reais.

### Não objetivos

O FisioZap não deve:

- diagnosticar;
- prescrever autonomamente;
- substituir avaliação profissional;
- registrar informação clínica definitiva sem revisão;
- realizar disparos promocionais ou massivos;
- confiar em identidade enviada pelo frontend;
- permitir acesso cruzado entre organizações.

---

# 5. Princípios de produto

## P1 — Simplicidade

O usuário deve conseguir realizar tarefas frequentes com poucos passos.

## P2 — Mobile-first

A experiência deve funcionar bem durante a rotina real do fisioterapeuta, inclusive em celular.

## P3 — Assistente, não piloto automático

Automação deve reduzir trabalho, não retirar controle profissional.

## P4 — Segurança por padrão

Autenticação, autorização, isolamento e menor privilégio fazem parte do produto, não são melhorias posteriores.

## P5 — Fonte única das regras

Frontend, WhatsApp e aplicativo móvel não devem criar regras de negócio independentes.

## P6 — Validar antes de expandir

Cada fase deve ser implementada, testada e validada antes da próxima.

---

# 6. Experiência principal

## Jornada principal

1. Usuário abre o FisioZap.
2. Sistema valida sessão.
3. Usuário visualiza sua organização e permissões.
4. Painel apresenta rotina e pendências.
5. Usuário consulta paciente ou agenda.
6. Usuário realiza o atendimento.
7. Usuário registra informações do atendimento.
8. Sistema atualiza histórico e pendências.
9. Usuário pode consultar a operação pelo assistente.
10. Usuário encerra a sessão quando necessário.

## Jornada conversacional futura

Exemplos:

- “O que tenho hoje?”
- “Quais pacientes tenho amanhã?”
- “Quais são minhas pendências?”
- “Mostre o paciente X.”
- “Prepare um rascunho da evolução.”
- “Quais exercícios estão associados a este protocolo?”

Toda ação deve respeitar identidade, organização, papel e permissões.

---

# 7. Personas funcionais

| Persona | Objetivo | Necessidades |
|---|---|---|
| Fisioterapeuta | atender e administrar sua operação | pacientes, agenda, evolução, rotina, financeiro |
| Owner | administrar organização | usuários, equipe, módulos, financeiro |
| Coordenador | supervisionar equipe | pacientes, agenda, evolução, protocolos, financeiro |
| Administrativo | apoiar operação | agenda, notificações, financeiro |
| Futuro paciente | acompanhar tratamento | acesso controlado a informações próprias |

No MVP, o foco é o fisioterapeuta.

---

# 8. Modelo de acesso

Papéis previstos:

- **owner**
- **professional**
- **coordinator**
- **administrative**

A disponibilidade dos módulos deve respeitar o papel do usuário.

### Matriz inicial

| Módulo | Owner | Coordinator | Professional | Administrative |
|---|---:|---:|---:|---:|
| Minha rotina | ✓ | ✓ | ✓ | ✓ |
| Pacientes | ✓ | ✓ | ✓ | — |
| Agenda | ✓ | ✓ | ✓ | ✓ |
| Evoluções | ✓ | ✓ | ✓ | — |
| Exercícios/protocolos | ✓ | ✓ | ✓ | — |
| Notificações | ✓ | ✓ | ✓ | ✓ |
| Financeiro | ✓ | ✓ | — | ✓ |

A autorização real deve ocorrer no servidor/banco. Ocultar botão no frontend nunca é considerado controle de segurança.

---

# 9. Requisitos funcionais

## FR-001 — Autenticação

O sistema deve:

- permitir login;
- manter sessão;
- permitir logout;
- validar sessão no servidor;
- impedir acesso a áreas protegidas sem autenticação.

**Aceite:** usuário não autenticado é redirecionado para login e não consegue acessar dados protegidos.

---

## FR-002 — Organização e identidade

O sistema deve associar o usuário à organização e ao papel correspondente.

**Aceite:** nenhuma operação de negócio pode depender de um `user_id` fornecido pelo cliente como fonte de identidade.

---

## FR-003 — Pacientes

O sistema deve permitir:

- criar paciente;
- consultar paciente;
- editar paciente;
- alterar status;
- listar pacientes permitidos ao usuário;
- associar profissional responsável;
- armazenar dados de contato;
- armazenar informações necessárias ao tratamento;
- relacionar paciente a agenda, atendimentos, protocolos e financeiro quando esses módulos existirem.

### Estados

- ativo;
- inativo;
- alta/desligado.

**Aceite:** usuário A não consegue consultar, alterar ou excluir dados pertencentes exclusivamente à organização B.

---

## FR-004 — Agenda

O sistema deve permitir:

- criar compromisso;
- definir paciente;
- definir profissional;
- definir data/hora;
- definir duração;
- consultar agenda;
- alterar status;
- reagendar/cancelar.

### Status

- agendado;
- confirmado;
- concluído;
- cancelado;
- falta;
- reagendado.

---

## FR-005 — Rotina

O sistema deve apresentar uma visão operacional do dia.

Deve permitir identificar:

- atendimentos;
- pendências;
- tarefas;
- próximos compromissos;
- alertas relevantes.

---

## FR-006 — Atendimento

O sistema deve registrar:

- paciente;
- profissional;
- data/hora;
- atendimento realizado;
- objetivos;
- exercícios;
- protocolos;
- observações;
- status.

---

## FR-007 — Evolução clínica

O sistema deve permitir histórico cronológico de evoluções.

Quando houver IA:

1. IA pode produzir rascunho.
2. Profissional revisa.
3. Profissional confirma.
4. Somente então o conteúdo passa a ser registro final.

**Aceite:** nenhuma sugestão de IA pode ser tratada automaticamente como evolução clínica final.

---

## FR-008 — Exercícios e protocolos

O sistema deve permitir biblioteca de:

- exercícios;
- objetivos;
- duração;
- repetições;
- frequência;
- observações;
- protocolos;
- protocolos personalizados.

Deve permitir associar protocolos a pacientes quando autorizado.

---

## FR-009 — Notificações e pendências

O sistema deve apresentar uma central operacional para:

- atendimento próximo;
- retorno necessário;
- paciente sem acompanhamento;
- documento próximo do vencimento;
- tarefa pendente;
- pendência financeira;
- alertas administrativos.

**Não é um módulo de broadcast.**

---

## FR-010 — Financeiro

O sistema deve permitir:

- receitas;
- despesas;
- pagamentos;
- vencimentos;
- lançamentos;
- associação com paciente quando aplicável;
- visão resumida da situação financeira.

---

## FR-011 — Assistente

O assistente deve:

- reconhecer o usuário autenticado;
- respeitar organização e papel;
- consultar somente dados autorizados;
- executar somente ações autorizadas;
- apresentar respostas compreensíveis;
- diferenciar sugestão de dado confirmado;
- evitar exposição de dados de terceiros.

---

## FR-012 — WhatsApp

O WhatsApp poderá funcionar como canal de assistência.

Deve permitir futuramente:

- consultar agenda;
- consultar pacientes;
- consultar pendências;
- registrar informações autorizadas;
- receber notificações;
- conversar com o assistente.

**Não deve ser usado para disparos massivos.**

---

## FR-013 — Documentos

O sistema deverá futuramente suportar:

- documentos profissionais;
- registros;
- certificados;
- documentos de conselho;
- vencimentos;
- lembretes;
- documentos relacionados a pacientes, quando permitido.

---

## FR-014 — Equipes e clínicas

A arquitetura deve permitir:

- múltiplos profissionais;
- organizações;
- grupos;
- coordenadores;
- administrativos;
- permissões;
- isolamento de dados.

---

# 10. Requisitos não funcionais

## NFR-001 — Segurança

O sistema deve adotar:

- autenticação;
- autorização server-side;
- RLS;
- menor privilégio;
- isolamento por organização;
- validação de entrada;
- proteção de secrets;
- CORS restritivo;
- rate limiting adequado;
- logs sem dados clínicos desnecessários;
- revisão de segurança.

## NFR-002 — Privacidade

Dados clínicos reais somente podem ser utilizados após validação da camada de segurança.

Durante desenvolvimento e testes devem ser utilizados dados fictícios.

## NFR-003 — Auditabilidade

Ações sensíveis devem ser rastreáveis quando necessário, especialmente:

- alterações de acesso;
- ações administrativas;
- alterações de dados clínicos;
- ações executadas por automação/IA.

## NFR-004 — Disponibilidade e recuperação

Falhas de backend, rede ou integração não devem causar perda silenciosa de dados.

Operações críticas devem retornar erro explícito e seguro.

## NFR-005 — Responsividade

A interface deve ser utilizável em desktop e celular.

O fluxo principal deve priorizar telas pequenas e uso durante atendimento.

## NFR-006 — Performance

Requisitos de performance devem ser definidos por fluxo à medida que o MVP for implementado. Nenhum requisito vago como “ser rápido” será considerado critério de aceite.

---

# 11. Modelo de dados conceitual

Entidades principais previstas:

- User
- Organization
- OrganizationMember
- Profile
- Patient
- PatientGroup
- Appointment
- ClinicalNote / Evolution
- Exercise
- Skill / Protocol
- PatientProtocol
- Notification
- FinancialEntry
- Document
- AuditEvent

### Regra de relacionamento

Entidades de negócio que contenham dados privados devem possuir caminho inequívoco para determinar a organização responsável.

---

# 12. Arquitetura de produto

## Frontend

- Next.js
- React
- TypeScript
- responsivo/mobile-first
- Vercel como destino de produção

## Backend

- Node.js
- Express
- responsável por regras de negócio e integrações
- execução local durante a fase atual

## Dados

- Supabase
- PostgreSQL
- Supabase Auth
- RLS
- migrations versionadas

## IA

A IA deve ser executada no servidor, com credenciais fora do navegador e acesso por ferramentas/permissões controladas.

## Canais

- Web
- futuro Android
- futuro WhatsApp

Todos devem consumir a mesma camada de regras de negócio.

---

# 13. MVP

O MVP funcional do produto deve priorizar:

### Must-have

1. autenticação;
2. organização e papéis;
3. isolamento de dados;
4. pacientes;
5. agenda;
6. rotina;
7. atendimento;
8. evolução;
9. notificações;
10. interface mobile-first.

### Should-have

- exercícios/protocolos;
- financeiro básico;
- assistente conversacional;
- documentos.

### Could-have

- WhatsApp;
- IA avançada;
- integrações externas;
- emissão fiscal;
- grupos especializados.

### Won't-have no MVP

- marketplace;
- aplicativo de paciente;
- diagnóstico automatizado;
- disparos em massa;
- ERP completo de clínica;
- automações clínicas autônomas.

---

# 14. Roadmap oficial

| Fase | Objetivo | Estado |
|---|---|---|
| S0 | Fundação | concluída |
| S1 | Autenticação/base operacional | validada em testes |
| S1.5 | Segurança, RLS e reconciliação Supabase | em validação |
| S2 | Pacientes | próxima |
| S3 | Agenda e rotina | planejada |
| S4 | Atendimento e evolução | planejada |
| S5 | Notificações | em andamento — S5.1 em `TESTES`; S5.2 em desenvolvimento |
| S6 | Financeiro | planejada |
| S7 | Assistente IA | planejada |
| S8 | WhatsApp | planejada |
| S9 | Documentos/integrações | planejada |
| S10 | Clínicas/equipes | planejada |
| S11 | Aplicativo móvel | planejada |
| S12 | Escala/freemium/produção | planejada |

### Regra de avanço

Uma fase somente pode ser marcada como concluída quando houver:

1. implementação;
2. testes;
3. validação funcional;
4. validação de segurança quando aplicável;
5. documentação;
6. checkpoint;
7. commit;
8. aprovação para promoção.

---

# 15. S2 — Especificação inicial de Pacientes

A S2 é o primeiro módulo de negócio prioritário.

## Objetivo

Permitir que um fisioterapeuta consiga cadastrar, consultar, editar e organizar seus pacientes com isolamento seguro por organização.

## Campos mínimos

- nome completo;
- telefone;
- e-mail opcional;
- endereço opcional;
- data de nascimento opcional;
- status;
- condição/queixa principal;
- objetivo do tratamento;
- data de início;
- grupo opcional;
- profissional responsável.

## Operações

### Criar

Usuário autorizado informa dados e cria paciente.

### Listar

Usuário recebe somente pacientes que pode acessar.

### Consultar

Usuário abre detalhes do paciente autorizado.

### Editar

Usuário autorizado altera dados.

### Alterar status

Usuário pode ativar, inativar ou registrar alta conforme sua permissão.

### Exclusão

Exclusão física não deve ser assumida como comportamento padrão. Quando houver necessidade de remoção, a solução deve considerar retenção, histórico e auditoria.

## Critérios de aceite da S2

- [ ] CRUD funcional.
- [ ] RLS validada.
- [ ] autorização server-side validada.
- [ ] teste positivo de acesso.
- [ ] teste negativo entre organizações.
- [ ] profissional só acessa o que sua permissão permite.
- [ ] frontend não define a identidade do usuário.
- [ ] erros são tratados sem expor detalhes internos.
- [ ] dados de teste são fictícios.
- [ ] documentação/checkpoint atualizado.
- [ ] build e testes executados.

---

# 16. Segurança específica para dados clínicos

Antes de produção com dados reais:

### Obrigatório

- autenticação robusta;
- autorização por organização/papel;
- RLS validada;
- testes negativos;
- secrets fora do cliente;
- logs seguros;
- backup/recuperação definidos;
- política de retenção;
- revisão de segurança;
- revisão de integrações de IA;
- rastreabilidade de ações sensíveis.

### IA e dados clínicos

A IA não deve:

- decidir diagnóstico;
- alterar registro clínico confirmado sem autorização;
- executar ação clínica autônoma;
- acessar pacientes fora do contexto autorizado;
- receber mais dados do que precisa para a tarefa.

---

# 17. Critérios de release

Uma versão somente pode ser considerada pronta quando:

### Funcionalidade

- requisitos Must-have implementados;
- fluxos principais funcionando;
- erros principais tratados.

### Segurança

- autenticação funcionando;
- autorização validada;
- RLS validada;
- testes negativos executados;
- nenhum secret exposto.

### Qualidade

- testes automatizados relevantes passando;
- build passando;
- documentação atualizada;
- nenhuma funcionalidade simulada apresentada como real.

### Operação

- configuração documentada;
- migrations reproduzíveis;
- rollback/recovery considerados;
- deploy somente pela branch estável conforme regra do projeto.

---

# 18. Métricas de sucesso

Após o MVP, acompanhar:

- tempo para cadastrar primeiro paciente;
- tempo para encontrar um paciente;
- tempo para registrar um atendimento;
- percentual de atendimentos com evolução registrada;
- quantidade de pendências vencidas;
- frequência de uso semanal;
- retenção de profissionais;
- uso do assistente;
- taxa de erros por fluxo;
- incidentes de autorização.

As métricas devem servir para validar se o produto realmente reduz trabalho operacional.

---

# 19. Regras de desenvolvimento

## Branches

- `TESTES`: desenvolvimento e validação.
- `main`: estável/protegida.
- nenhuma implementação direta em `main`.

## Deploy

Deploy automático de produção somente pela `main`.

Branches paralelas não devem realizar deploy automático de produção.

## Agentes de desenvolvimento

Qualquer agente deve:

1. ler este documento antes de implementar;
2. respeitar o escopo;
3. não inventar requisitos;
4. não substituir regra de segurança por mock;
5. testar sua alteração;
6. documentar o que mudou;
7. informar limitações;
8. não considerar “funciona localmente” como validação de produção.

---

# 20. Documentos relacionados

- `README.md` — visão geral e estado do projeto.
- `CHECKPOINT.md` — checkpoint geral.
- `app/CHECKPOINT.md` — estado do frontend.
- `supabase/migrations/CHECKPOINT.md` — banco/RLS/migrations.
- `docs/local-development.md` — execução local.
- `docs/security.md` — segurança.
- `docs/mobile-app.md` — estratégia mobile.
- `docs/mvp.md` — escopo MVP.
- `docs/equipe-desenvolvimento-roadmap.md` — organização do desenvolvimento.

Este PRD deve ser atualizado quando uma decisão de produto for formalmente alterada.

---

# 21. Decisões abertas

Estas questões não devem ser inventadas pelo agente; devem ser decididas antes das respectivas fases:

- modelo definitivo de planos freemium;
- limites por plano;
- provedor de IA;
- estratégia definitiva do WhatsApp;
- política de retenção de dados clínicos;
- política de backup;
- integrações fiscais;
- integrações governamentais;
- escopo definitivo do aplicativo Android;
- métricas comerciais;
- requisitos jurídicos/compliance para produção.

---

# 22. Definição de pronto do produto

O FisioZap será considerado pronto para uma primeira operação real quando um fisioterapeuta conseguir:

**entrar → visualizar sua rotina → cadastrar paciente → agendar atendimento → realizar atendimento → registrar evolução → acompanhar pendências → consultar informações pelo assistente**, 

com **isolamento de dados, autenticação, autorização e segurança comprovados**.

---

## Controle de versão

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 06/10/2026 | Primeira especificação consolidada do produto |

> **Regra:** este documento define o escopo funcional. A implementação técnica deve respeitar estas especificações, mas não deve introduzir comportamento de produto não aprovado.

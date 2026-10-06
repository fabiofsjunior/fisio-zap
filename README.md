# FisioZap

**FisioZap** é uma plataforma de gestão e assistência para fisioterapeutas, pensada primeiro para profissionais autônomos e de atendimento domiciliar e preparada para evoluir para clínicas, equipes e grupos de profissionais.

A proposta é simples: **reduzir o trabalho operacional do fisioterapeuta e concentrar, em um único lugar, pacientes, rotina, agenda, atendimentos, evolução clínica, protocolos, notificações e financeiro — com um assistente conversacional como camada de interação.**

> **Status atual:** projeto em construção e validação. A infraestrutura de autenticação, backend, Supabase, segurança/RLS e ambiente de testes está sendo consolidada antes da implementação dos módulos funcionais.

---

## 🎯 Visão do produto

O FisioZap deverá funcionar como um **assistente operacional do fisioterapeuta**, ajudando a transformar a rotina diária em um fluxo simples:

**Hoje → Pacientes → Atendimento → Evolução → Acompanhamento → Pendências → Financeiro**

O sistema não pretende substituir o fisioterapeuta. A IA deverá apoiar tarefas administrativas e produzir rascunhos/sugestões para revisão profissional.

### Exemplo de uso

1. O fisioterapeuta abre o FisioZap.
2. Consulta a rotina e as pendências do dia.
3. Acessa o paciente e seu histórico.
4. Prepara o atendimento usando protocolos e exercícios.
5. Registra o atendimento por formulário ou linguagem natural.
6. O assistente pode preparar um rascunho de evolução.
7. O fisioterapeuta revisa e confirma.
8. O acompanhamento do paciente é atualizado.
9. O sistema registra pendências, notificações e informações financeiras relacionadas.

---

# 🧩 Escopo geral do projeto

## 1. 👤 Usuários, acesso e organizações

Base de segurança e controle de acesso.

- Cadastro e autenticação de usuários.
- Login e logout.
- Sessão persistente.
- Perfis profissionais.
- Organizações.
- Papéis e permissões.
- Profissional responsável por pacientes.
- Estrutura preparada para equipes e clínicas.
- Isolamento dos dados por organização.
- Row Level Security (RLS) no Supabase.

### Papéis previstos

- **Owner**
- **Professional**
- **Coordinator**
- **Administrative**

---

## 2. 🧑‍⚕️ Pacientes

Núcleo principal do sistema.

- Cadastro de pacientes.
- Dados pessoais e de contato.
- Endereço.
- Situação do paciente:
  - ativo;
  - inativo;
  - alta/desligado.
- Condição clínica.
- Objetivo do tratamento.
- Data de início.
- Grupo do paciente.
- Profissional responsável.
- Histórico e contexto clínico.
- Associação com atendimentos, documentos, protocolos e financeiro.

---

## 3. 📅 Agenda e rotina

Organizar o dia do profissional.

- Agenda de atendimentos.
- Horários.
- Duração.
- Paciente.
- Profissional responsável.
- Status do atendimento:
  - agendado;
  - confirmado;
  - concluído;
  - cancelado;
  - falta;
  - reagendado.
- Visão da rotina diária.
- Pendências.
- Preparação do próximo atendimento.

---

## 4. 🩺 Atendimentos e evolução clínica

Registrar o que aconteceu durante o atendimento.

- Registro de atendimento.
- Evolução clínica.
- Observações.
- Objetivos trabalhados.
- Exercícios realizados.
- Protocolos utilizados.
- Associação com paciente e profissional.
- Histórico cronológico.
- Rascunhos gerados pelo assistente.
- Revisão e confirmação pelo fisioterapeuta.

### Regra importante

A IA pode **sugerir ou preparar um rascunho**, mas a informação clínica final deve depender da revisão e confirmação do profissional.

---

## 5. 🧠 Exercícios, habilidades e protocolos

Criar uma biblioteca reutilizável para apoiar os atendimentos.

- Exercícios.
- Objetivos.
- Duração.
- Repetições.
- Frequência.
- Observações.
- Habilidades/protocolos.
- Protocolos personalizados.
- Conteúdo e orientações.
- Tempo estimado de sessão.
- Associação de protocolos aos pacientes.

A arquitetura deverá permitir evoluir posteriormente para bibliotecas especializadas, inclusive protocolos por área de atuação.

---

## 6. 🔔 Notificações e pendências

O FisioZap deverá ajudar o profissional a não esquecer tarefas importantes.

Exemplos:

- atendimento próximo;
- paciente sem acompanhamento;
- documento próximo do vencimento;
- pendência financeira;
- tarefa da rotina;
- retorno necessário;
- alerta administrativo.

A área de notificações deverá funcionar como uma **central de pendências do dia**, e não como ferramenta de disparo em massa.

---

## 7. 💰 Financeiro

Controle financeiro básico para o profissional.

- Receitas.
- Despesas.
- Lançamentos financeiros.
- Vencimentos.
- Pagamentos.
- Associação com pacientes quando aplicável.
- Visão básica da situação financeira.

### Evolução futura

- relatórios;
- indicadores;
- conciliação;
- integração com emissão fiscal;
- automações financeiras.

---

## 8. 🤖 Assistente conversacional / IA

O assistente será uma das principais formas de interação com o sistema.

Exemplos de solicitações:

> "O que tenho hoje?"

> "Quais pacientes tenho amanhã?"

> "Mostre as pendências."

> "Prepare um rascunho da evolução deste atendimento."

> "Quais exercícios estão associados a este protocolo?"

> "Existe algum paciente sem acompanhamento recente?"

A IA deverá operar com **permissões, contexto e limites definidos pelo sistema**.

### Princípios

- Nunca confiar apenas em dados enviados pelo navegador.
- Não expor chaves privadas no frontend.
- Não permitir acesso indevido a pacientes.
- Não tomar decisões clínicas autônomas.
- Não registrar evolução clínica definitiva sem confirmação profissional.
- Registrar ações importantes de forma rastreável.

---

## 9. 📄 Documentos e lembretes profissionais

Estrutura para documentos relacionados ao profissional e à operação.

Possibilidades:

- documentos profissionais;
- registros e certificados;
- documentos de conselho;
- vencimentos;
- lembretes;
- documentos relacionados a pacientes;
- armazenamento seguro.

### Evolução planejada

Integração com serviços externos e APIs governamentais quando houver necessidade e segurança para isso.

---

## 10. 💬 WhatsApp

O WhatsApp é pensado como **canal de assistência e interação**, não como plataforma de disparo.

O objetivo é permitir futuramente que o profissional consulte e execute determinadas tarefas através de conversas, mantendo as regras de negócio no backend.

Exemplos:

- consultar agenda;
- consultar paciente;
- consultar pendências;
- registrar informações;
- receber notificações;
- interagir com o assistente.

**Não faz parte da proposta:** disparos promocionais ou envio massivo de mensagens.

---

## 11. 📱 Aplicativo móvel

A estratégia inicial é manter uma única aplicação web responsiva e preparada para uso em celular.

Posteriormente, o projeto poderá evoluir para um aplicativo Android, utilizando a mesma base funcional.

Objetivos:

- acesso rápido;
- experiência mobile-first;
- notificações;
- chat;
- consulta da rotina;
- uso durante atendimento.

O aplicativo móvel **não deve criar uma segunda regra de negócio**. O backend continua sendo a fonte das regras e permissões.

---

## 12. 🏥 Evolução para clínicas e equipes

A primeira versão é direcionada ao fisioterapeuta autônomo, especialmente atendimento domiciliar.

A arquitetura, porém, será preparada para evoluir para:

- clínicas;
- equipes;
- profissionais cooperados;
- coordenadores;
- administrativos;
- grupos especializados;
- múltiplos profissionais trabalhando sobre uma mesma organização.

---

# 🏗️ Arquitetura

## Frontend

- Next.js
- React
- TypeScript
- Interface responsiva/mobile-first
- Deploy planejado na Vercel

## Backend

- Node.js
- Express
- Execução local durante o desenvolvimento atual
- Fonte central das regras de negócio e integrações

## Banco e autenticação

- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security (RLS)
- Migrations versionadas

## IA

A camada de IA deverá ser integrada no servidor, com provider configurável e sem expor credenciais ao navegador.

## Segurança

O projeto deve seguir como princípios:

- menor privilégio;
- isolamento por organização;
- RLS;
- validação server-side;
- proteção de segredos;
- APIs com autenticação/autorização;
- logs sem dados clínicos desnecessários;
- revisão de segurança antes de conectar dados reais.

---

# 🗺️ Roadmap geral

O desenvolvimento será incremental. Cada etapa precisa ser validada antes de avançar.

### S0 — Fundação
**Objetivo:** estruturar o projeto.

- repositório;
- arquitetura inicial;
- ambiente;
- frontend;
- backend;
- Supabase;
- documentação.

**Status:** concluída.

### S1 — Autenticação e base operacional
**Objetivo:** garantir que o usuário consiga entrar e que a infraestrutura básica funcione.

- login;
- sessão;
- usuários;
- organizações;
- backend;
- ambiente local;
- contas de teste;
- primeiros testes.

**Status:** validada em ambiente de testes.

### S1.5 — Segurança e reconciliação do Supabase
**Objetivo:** garantir que o banco esteja coerente, reproduzível e protegido.

- reconciliação do schema;
- migrations;
- RLS;
- funções protegidas;
- grants;
- índices;
- CI;
- smoke tests;
- testes negativos de isolamento.

**Status:** em validação final.

### S2 — Pacientes
**Objetivo:** criar o primeiro módulo funcional de negócio.

- CRUD de pacientes;
- status;
- grupos;
- profissional responsável;
- condição;
- objetivo do tratamento;
- dados de contato/endereço;
- isolamento por organização;
- testes de autorização.

### S3 — Agenda e rotina
- agenda;
- compromissos;
- status;
- rotina diária;
- preparação do atendimento;
- pendências.

### S4 — Atendimento e evolução
- registro de atendimento;
- evolução;
- histórico;
- exercícios;
- protocolos;
- revisão/confirmação.

### S5 — Notificações
- central de notificações;
- pendências;
- lembretes;
- documentos;
- tarefas.

### S6 — Financeiro
- receitas;
- despesas;
- vencimentos;
- pagamentos;
- indicadores básicos.

### S7 — Assistente IA
- chat;
- contexto do usuário;
- consultas;
- criação de rascunhos;
- ferramentas controladas;
- auditoria;
- proteção contra uso indevido.

### S8 — WhatsApp
- integração como canal;
- consultas;
- comandos;
- notificações;
- ações autorizadas.

Sem disparos em massa.

### S9 — Documentos e integrações
- documentos profissionais;
- lembretes;
- integrações externas;
- emissão fiscal quando aplicável;
- APIs governamentais quando justificadas.

### S10 — Clínicas e equipes
- organizações;
- equipes;
- permissões;
- coordenação;
- administrativos;
- múltiplos profissionais.

### S11 — Aplicativo móvel
- experiência mobile;
- notificações;
- Android;
- distribuição;
- eventual evolução para outras plataformas.

### S12 — Escala e produto
- observabilidade;
- performance;
- billing/freemium;
- planos;
- métricas;
- suporte;
- produção;
- expansão comercial.

---

# 💳 Modelo de negócio planejado

O produto nasce com possibilidade de modelo **freemium**.

A estrutura poderá evoluir para:

- plano gratuito;
- plano profissional;
- recursos avançados;
- planos para equipes;
- planos para clínicas.

O modelo comercial definitivo será decidido após validação do produto e dos fluxos principais.

---

# 🚫 O que o FisioZap não pretende ser

Para evitar desvio de escopo:

- não é um sistema de diagnóstico médico;
- não substitui o fisioterapeuta;
- não toma decisões clínicas autonomamente;
- não é uma ferramenta de disparo de WhatsApp em massa;
- não é inicialmente um marketplace;
- não começa como aplicativo exclusivo para pacientes;
- não começa como ERP completo de clínica;
- não deve conectar dados clínicos reais antes da validação de segurança e autorização.

---

# 🔐 Segurança e privacidade

Dados de saúde exigem tratamento cuidadoso.

Antes de utilizar dados clínicos reais, o projeto deverá comprovar:

- autenticação funcional;
- autorização server-side;
- RLS;
- isolamento entre organizações;
- ausência de secrets no cliente;
- proteção das APIs;
- validação de entrada;
- logs seguros;
- migrations reproduzíveis;
- testes de acesso negativo;
- revisão de segurança.

**Dados de teste devem ser fictícios durante o desenvolvimento.**

---

# 🌿 Estratégia de desenvolvimento

A regra principal é:

> **Construir pequeno, validar, documentar e só então avançar.**

Cada etapa deve possuir:

1. escopo definido;
2. implementação;
3. testes;
4. validação;
5. checkpoint;
6. commit;
7. promoção somente após aprovação.

### Branches

- `TESTES`: desenvolvimento e validação.
- `main`: branch protegida/estável.
- Desenvolvimento direto em `main` não é permitido.

### Deploy

A regra atual é:

**deploy automático somente pela `main`.**

Branches paralelas não devem realizar deploy automático na Vercel.

---

# 🧪 Qualidade

Antes de considerar uma etapa concluída:

- frontend deve compilar;
- backend deve iniciar;
- testes devem passar;
- migrations devem ser reproduzíveis;
- RLS deve ser validada;
- autenticação deve continuar funcionando;
- alterações devem ser revisadas;
- nenhum mock deve ser apresentado como funcionalidade real;
- bloqueios devem ser documentados.

---

# 📚 Documentação

Documentos importantes:

- [Roadmap e responsabilidades](docs/equipe-desenvolvimento-roadmap.md)
- [MVP](docs/mvp.md)
- [Desenvolvimento local](docs/local-development.md)
- [Segurança](docs/security.md)
- [Aplicativo móvel](docs/mobile-app.md)
- [Checkpoint geral](CHECKPOINT.md)
- [Checkpoint do banco](supabase/migrations/CHECKPOINT.md)

---

# 🚀 Desenvolvimento local

O projeto possui scripts e documentação para executar o ambiente local.

Principais referências:

- `FisioZap-Local.cmd`
- `.env.example`
- `.env.local`
- `docs/local-development.md`

**Nunca versionar credenciais, tokens ou chaves privadas.**

---

# 📌 Estado atual

O FisioZap está na transição entre a **fundação técnica** e o primeiro módulo de negócio.

A sequência imediata é:

**S1.5 → concluir validação do Supabase → S2 Pacientes.**

Não iniciar módulos posteriores enquanto a base de autenticação, banco e segurança não estiver validada.

---

## Licença

Projeto privado em desenvolvimento.

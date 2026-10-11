export type FisioRole = 'owner' | 'professional' | 'coordinator' | 'administrative';

export const ROLE_MODULES: Record<FisioRole, string[]> = {
  owner: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro', 'Documentos profissionais'],
  coordinator: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro', 'Documentos profissionais'],
  professional: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro', 'Documentos profissionais'],
  administrative: ['Minha rotina', 'Agenda', 'Notificações', 'Financeiro', 'Documentos profissionais'],
};

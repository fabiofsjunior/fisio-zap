export type FisioRole = 'owner' | 'professional' | 'coordinator' | 'administrative';

export const ROLE_MODULES: Record<FisioRole, string[]> = {
  owner: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro'],
  coordinator: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro'],
  professional: ['Minha rotina', 'Pacientes', 'Agenda', 'Evoluções', 'Exercícios e protocolos', 'Notificações', 'Financeiro'],
  administrative: ['Minha rotina', 'Agenda', 'Notificações', 'Financeiro'],
};

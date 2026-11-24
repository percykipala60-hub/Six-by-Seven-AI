/** Messages échangés pendant une tâche de l'agent Cosinus (format commun à Claude et à l'IA locale). */

export type AppelOutil = { id: string; nom: string; args: Record<string, unknown> };

export type ImageAgent = { type: 'image/jpeg' | 'image/png'; data: string };

export type MessageAgent =
  | { role: 'user'; content: string; images?: ImageAgent[] }
  | { role: 'assistant'; content: string; appels?: AppelOutil[] }
  | { role: 'tool'; id: string; nom: string; content: string };

export type ReponseAgent = { texte: string; appels: AppelOutil[] };

export type OutilSchema = {
  nom: string;
  description: string;
  parametres: Record<string, unknown>;
};

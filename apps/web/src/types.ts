export type Persona = {
  id: string;
  name: string;
  subtitle?: string;
  description: string;
  speakingStyle?: string;
  systemPrompt: string;
  modelKey: string;
  avatar?: string;
  accent?: string;
  intro?: string;
  isSystem?: boolean;
  extensible?: boolean;
  creatorId?: string;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

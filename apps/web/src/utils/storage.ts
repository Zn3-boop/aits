const KEYS = {
  USER: 'user',
  SETTINGS: 'lpm-settings',
  APP_SETTINGS: 'lpm-settings',
  PERSONA: 'lpm-persona',
  AUTO_VOICE: 'autoVoiceEnabled',
} as const;

export type Settings = {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  [key: string]: unknown;
};

function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function setItem(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private browsing
  }
}

function removeItem(key: string): void {
  localStorage.removeItem(key);
}

function getPrimitive(key: string): string | null {
  return localStorage.getItem(key);
}

function setPrimitive(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota exceeded or private browsing
  }
}

export const storage = {
  KEYS,
  getItem,
  setItem,
  removeItem,
  getPrimitive,
  setPrimitive,
};

/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Settings, PersonaConfig } from '../types/index';
import { storage } from '../utils/storage';

export interface AppContextType {
  settings: Settings;
  updateSettings: (settings: Partial<Settings>) => void;
  persona: PersonaConfig;
  updatePersona: (persona: Partial<PersonaConfig>) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_SETTINGS: Settings = {
  apiUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  wsUrl: import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8787',
  modelProvider: 'ollama',
  modelName: 'qwen2.5:7b',
  theme: 'dark',
  language: 'zh-CN',
  notifications: true,
  autoScroll: true
};

const DEFAULT_PERSONA: PersonaConfig = {
  name: '小助手',
  personality: '友善、耐心、乐于助人',
  tone: '温暖亲切',
  background: '我是一个 AI 助手，随时准备帮助你解决问题。',
  interests: ['科技', '音乐', '阅读'],
  relationship: 'assistant'
};

interface AppProviderProps {
  children: ReactNode;
}

const readStoredSettings = (): Settings => {
  return storage.getItem<Settings>(storage.KEYS.SETTINGS, DEFAULT_SETTINGS);
};

const readStoredPersona = (): PersonaConfig => {
  return storage.getItem<PersonaConfig>(storage.KEYS.PERSONA, DEFAULT_PERSONA);
};

export const AppProvider = ({ children }: AppProviderProps) => {
  const [settings, setSettings] = useState<Settings>(readStoredSettings);
  const [persona, setPersona] = useState<PersonaConfig>(readStoredPersona);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const theme = settings.theme;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }, [settings.theme]);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings((currentSettings) => {
      const updatedSettings = { ...currentSettings, ...newSettings };
      storage.setItem(storage.KEYS.SETTINGS, updatedSettings);
      return updatedSettings;
    });
  }, []);

  const updatePersona = useCallback((newPersona: Partial<PersonaConfig>) => {
    setPersona((currentPersona) => {
      const updatedPersona = { ...currentPersona, ...newPersona };
      storage.setItem(storage.KEYS.PERSONA, updatedPersona);
      return updatedPersona;
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      settings,
      updateSettings,
      persona,
      updatePersona,
      isLoading,
      setIsLoading
    }),
    [isLoading, persona, settings, updatePersona, updateSettings]
  );

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};
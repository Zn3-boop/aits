import { useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { storage } from '../utils/storage';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() =>
    storage.getItem<AppSettings>(storage.KEYS.APP_SETTINGS, DEFAULT_SETTINGS)
  );

  useEffect(() => {
    storage.setItem(storage.KEYS.APP_SETTINGS, settings);
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSetting, resetSettings };
}
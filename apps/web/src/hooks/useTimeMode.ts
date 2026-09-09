import { useState, useEffect } from 'react';

type TimeMode = 'morning' | 'afternoon' | 'evening' | 'night';

export function useTimeMode() {
  const [timeMode, setTimeMode] = useState<TimeMode>('morning');

  useEffect(() => {
    const updateTimeMode = () => {
      const hour = new Date().getHours();
      if (hour < 12) setTimeMode('morning');
      else if (hour < 18) setTimeMode('afternoon');
      else if (hour < 22) setTimeMode('evening');
      else setTimeMode('night');
    };
    updateTimeMode();
    const timer = window.setInterval(updateTimeMode, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return { timeMode, setTimeMode };
}
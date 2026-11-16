"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('orion-theme') as Theme | null;
    const initial: Theme = saved === 'light' ? 'light' : 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggle = useCallback(() => {
    const apply = () => setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('orion-theme', next);
      return next;
    });
    /* transición suave entre temas (View Transitions API; si no existe, cambio directo) */
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (d.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      d.startViewTransition(() => { flushSync(apply); });
    } else apply();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'theme';

/**
 * Theme preference.
 *
 * The application is light (white) by default — every visitor gets the same
 * first impression regardless of their operating system. A user who toggles
 * the theme has that explicit choice persisted and it wins from then on.
 * We deliberately do NOT follow prefers-color-scheme, so a bank's console
 * looks the same for everyone until someone chooses otherwise.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preference);
    document.documentElement.style.colorScheme = preference;
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  const toggle = () => setPreference((p) => (p === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme: preference, preference, toggle, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

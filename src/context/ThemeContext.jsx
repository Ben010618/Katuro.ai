import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => localStorage.getItem('kt-dark') === 'true');

  useEffect(() => {
    document.documentElement.setAttribute('data-dark', dark ? 'true' : 'false');
    localStorage.setItem('kt-dark', String(dark));
  }, [dark]);

  const toggle = () => setDark(d => !d);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

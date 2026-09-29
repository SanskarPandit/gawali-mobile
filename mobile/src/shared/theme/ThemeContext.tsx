import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { colors, ThemeColors } from './colors';
import { typography, spacing, borderRadius, shadows } from './tokens';

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
  toggleTheme: () => void;
  setScheme: (mode: 'light' | 'dark' | 'system') => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: colors.light,
  typography,
  spacing,
  borderRadius,
  shadows,
  toggleTheme: () => {},
  setScheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>('light');

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  const toggleTheme = () => {
    setMode(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors: currentColors,
        typography,
        spacing,
        borderRadius,
        shadows,
        toggleTheme,
        setScheme: setMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

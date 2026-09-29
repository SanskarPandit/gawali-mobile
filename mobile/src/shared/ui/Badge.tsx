import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'emerald';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
  style,
}) => {
  const { colors, isDark } = useTheme();

  const getColors = (): { bg: string; text: string; border?: string } => {
    switch (variant) {
      case 'success':
      case 'emerald':
        return {
          bg: isDark ? 'rgba(14, 163, 113, 0.2)' : '#D1FAE5',
          text: isDark ? '#34D399' : '#065F46',
          border: isDark ? 'rgba(14, 163, 113, 0.4)' : undefined,
        };
      case 'warning':
        return {
          bg: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
          text: isDark ? '#FBBF24' : '#92400E',
          border: isDark ? 'rgba(245, 158, 11, 0.4)' : undefined,
        };
      case 'error':
        return {
          bg: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
          text: isDark ? '#F87171' : '#991B1B',
          border: isDark ? 'rgba(239, 68, 68, 0.4)' : undefined,
        };
      case 'info':
        return {
          bg: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE',
          text: isDark ? '#60A5FA' : '#1E40AF',
          border: isDark ? 'rgba(59, 130, 246, 0.4)' : undefined,
        };
      case 'neutral':
      default:
        return {
          bg: isDark ? 'rgba(148, 163, 184, 0.2)' : '#F3F4F6',
          text: isDark ? '#94A3B8' : '#4B5563',
          border: isDark ? 'rgba(148, 163, 184, 0.3)' : undefined,
        };
    }
  };

  const colorConfig = getColors();

  return (
    <View
      style={[
        styles.container,
        size === 'sm' ? styles.containerSm : styles.containerMd,
        { backgroundColor: colorConfig.bg },
        colorConfig.border ? { borderWidth: 1, borderColor: colorConfig.border } : null,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          size === 'sm' ? styles.textSm : styles.textMd,
          { color: colorConfig.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerSm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  containerMd: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textSm: {
    fontSize: 10,
  },
  textMd: {
    fontSize: 11,
  },
});

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Card } from './Card';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: string;
  trendPositive?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendPositive = true,
  style,
  onPress,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <Card style={[styles.container, style]} onPress={onPress}>
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          {title}
        </Text>
        {icon && (
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: isDark ? 'rgba(14, 163, 113, 0.15)' : '#ECFDF5' },
            ]}
          >
            {icon}
          </View>
        )}
      </View>

      <Text style={[styles.value, { color: colors.textPrimary }]}>{value}</Text>

      {(subtitle || trend) && (
        <View style={styles.bottomRow}>
          {trend && (
            <Text
              style={[
                styles.trend,
                { color: trendPositive ? colors.primary : colors.error },
              ]}
            >
              {trend}
            </Text>
          )}
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {subtitle}
            </Text>
          )}
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  trend: {
    fontSize: 12,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightAction,
  style,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 12),
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
        style,
      ]}
    >
      <View style={styles.contentRow}>
        {onBack ? (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={onBack}
            style={[
              styles.backButton,
              { backgroundColor: isDark ? colors.surface : '#F1F5F9' },
            ]}
          >
            <Text style={[styles.backArrow, { color: colors.textPrimary }]}>‹</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.titleArea}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.textPrimary }]}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              numberOfLines={1}
              style={[styles.subtitle, { color: colors.textSecondary }]}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {rightAction ? (
          <View style={styles.rightActionArea}>{rightAction}</View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backArrow: {
    fontSize: 26,
    fontWeight: '300',
    marginTop: -2,
  },
  titleArea: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rightActionArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
});

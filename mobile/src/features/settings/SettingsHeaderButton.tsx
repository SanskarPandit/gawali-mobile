import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';

/** Gear button for screen headers that opens the current role's settings page. */
export const SettingsHeaderButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
      accessibilityRole="button"
      accessibilityLabel={t('settings.title', 'Settings')}
      hitSlop={6}
    >
      <Settings size={18} color={colors.textPrimary} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

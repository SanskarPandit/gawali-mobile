import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FlaskConical, LogOut } from 'lucide-react-native';
import { useAppDispatch, useAppSelector } from '../store';
import { signOut } from '../store/authSlice';

/** Asks for confirmation, then leaves demo mode and returns to the login screen. */
export const useExitDemo = () => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  return () =>
    Alert.alert(
      t('demo.exit_title', 'Exit demo mode?'),
      t('demo.exit_body', 'You will return to the login screen. Nothing from the demo is kept.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('demo.exit_confirm', 'Exit demo'), style: 'destructive', onPress: () => dispatch(signOut()) },
      ]
    );
};

/** Slim strip shown under every screen header while the app runs on demo data. */
export const DemoModeBar: React.FC = () => {
  const { t } = useTranslation();
  const isDemo = useAppSelector((state) => state.auth.sessionMode === 'demo');
  const exitDemo = useExitDemo();

  if (!isDemo) return null;

  return (
    <View style={styles.bar} accessibilityRole="summary">
      <FlaskConical size={14} color="#92400E" />
      <Text style={styles.text} numberOfLines={1}>
        {t('demo.banner', 'Demo mode · sample data, nothing is saved')}
      </Text>
      <TouchableOpacity
        onPress={exitDemo}
        style={styles.exitBtn}
        accessibilityRole="button"
        accessibilityLabel={t('demo.exit_confirm', 'Exit demo')}
        hitSlop={8}
      >
        <LogOut size={12} color="#FFFFFF" />
        <Text style={styles.exitText}>{t('demo.exit', 'Exit')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#B45309',
  },
  exitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

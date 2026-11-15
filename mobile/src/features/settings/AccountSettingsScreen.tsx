import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  FlaskConical,
  KeyRound,
  Languages,
  LogOut,
  Moon,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, BottomSheetModal, Button, Card, Header, Input } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import {
  changePassword,
  deleteAccount,
  Language,
  setLanguage,
  signOut,
  updateProfile,
  UserRole,
} from '../../app/store/authSlice';
import { useExitDemo } from '../../app/session/DemoModeBar';

const ROLE_LABEL: Record<UserRole, { key: string; fallback: string; variant: 'emerald' | 'info' | 'warning' | 'error' }> = {
  customer: { key: 'settings.role_customer', fallback: 'Customer', variant: 'emerald' },
  dairy: { key: 'settings.role_dairy', fallback: 'Dairy owner', variant: 'info' },
  delivery_boy: { key: 'settings.role_gawali', fallback: 'Gawali', variant: 'warning' },
  admin: { key: 'settings.role_admin', fallback: 'Platform admin', variant: 'error' },
};

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'mr', label: 'मराठी' },
  { code: 'hi', label: 'हिंदी' },
];

const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;

interface Props {
  navigation: any;
}

export const AccountSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { user, sessionMode, currentLanguage } = useAppSelector((state) => state.auth);
  const exitDemo = useExitDemo();
  const isDemo = sessionMode === 'demo';

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  const role = ROLE_LABEL[user.role];
  const cleanPhone = phone.replace(/[\s-]/g, '');
  const profileDirty = fullName.trim() !== user.fullName || cleanPhone !== user.phone;
  const nameError = fullName.trim() ? undefined : t('settings.name_required', 'Enter your name');
  const phoneError =
    cleanPhone && !PHONE_PATTERN.test(cleanPhone)
      ? t('settings.phone_invalid', 'Enter a valid mobile number, e.g. +919876543210')
      : undefined;

  const handleSaveProfile = async () => {
    if (nameError || phoneError) return;
    setSavingProfile(true);
    const result = await dispatch(updateProfile({ fullName, phone: cleanPhone }));
    setSavingProfile(false);
    if (updateProfile.fulfilled.match(result)) {
      Alert.alert(t('settings.saved_title', 'Saved'), t('settings.saved_body', 'Your details have been updated.'));
    } else {
      Alert.alert(t('settings.error_title', 'Something went wrong'), result.payload ?? '');
    }
  };

  const passwordError =
    newPassword && newPassword.length < 8
      ? t('settings.password_short', 'Use at least 8 characters')
      : confirmPassword && confirmPassword !== newPassword
        ? t('settings.password_mismatch', 'Passwords do not match')
        : undefined;
  const canChangePassword = !!oldPassword && newPassword.length >= 8 && newPassword === confirmPassword;

  const handleChangePassword = async () => {
    setSavingPassword(true);
    const result = await dispatch(changePassword({ oldPassword, newPassword }));
    setSavingPassword(false);
    if (changePassword.fulfilled.match(result)) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert(t('settings.saved_title', 'Saved'), t('settings.password_changed', 'Your password has been changed.'));
    } else {
      Alert.alert(t('settings.error_title', 'Something went wrong'), result.payload ?? '');
    }
  };

  const handleLanguage = (lang: Language) => {
    dispatch(setLanguage(lang));
    i18n.changeLanguage(lang);
  };

  const handleLogout = () =>
    Alert.alert(t('settings.logout_title', 'Log out?'), t('settings.logout_body', 'You will need to sign in again.'), [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      { text: t('settings.logout', 'Log out'), style: 'destructive', onPress: () => dispatch(signOut()) },
    ]);

  const openDelete = () => {
    setDeletePassword('');
    setDeleteError(null);
    setDeleteVisible(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const result = await dispatch(deleteAccount({ password: deletePassword }));
    setDeleting(false);
    if (deleteAccount.rejected.match(result)) {
      setDeleteError(result.payload ?? t('settings.error_title', 'Something went wrong'));
    }
    // On success the session ends and the app returns to the login screen by itself.
  };

  const deleteConsequence =
    user.role === 'dairy'
      ? t('settings.delete_dairy', 'Your dairy will be deactivated and customers can no longer order from it.')
      : user.role === 'delivery_boy'
        ? t('settings.delete_gawali', 'You will be removed from your dairy’s delivery team.')
        : user.role === 'admin'
          ? t('settings.delete_admin', 'You will lose access to the admin console. The last admin cannot be deleted.')
          : t('settings.delete_customer', 'Your subscriptions stop and you will no longer receive deliveries.');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('settings.title', 'Settings')}
        subtitle={t('settings.subtitle', 'Account, security and preferences')}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Identity */}
          <Card style={styles.identityCard}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{user.fullName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {user.fullName}
              </Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                {user.email}
              </Text>
              {user.dairyName && user.role !== 'customer' ? (
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {user.dairyName}
                </Text>
              ) : null}
            </View>
            <Badge label={t(role.key, role.fallback)} variant={role.variant} size="sm" />
          </Card>

          {isDemo && (
            <Card style={[styles.section, { backgroundColor: isDark ? colors.surface : '#FFFBEB' }]} variant="outlined">
              <View style={styles.sectionTitleRow}>
                <FlaskConical size={16} color="#B45309" />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  {t('demo.settings_title', 'You are in demo mode')}
                </Text>
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {t('demo.settings_body', 'You are exploring sample data. Changes are not saved, and password and account deletion are turned off.')}
              </Text>
              <Button title={t('demo.exit_confirm', 'Exit demo')} icon={<LogOut size={16} color="#FFFFFF" />} onPress={exitDemo} />
            </Card>
          )}

          {/* Personal information */}
          <Card style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <UserRound size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('settings.personal_info', 'Personal information')}
              </Text>
            </View>
            <Input
              label={t('settings.full_name', 'Full name')}
              value={fullName}
              onChangeText={setFullName}
              error={fullName !== user.fullName ? nameError : undefined}
              autoCapitalize="words"
              textContentType="name"
            />
            <Input
              label={t('settings.phone', 'Mobile number')}
              value={phone}
              onChangeText={setPhone}
              error={phoneError}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
            />
            <Input
              label={t('settings.email', 'Email')}
              value={user.email}
              editable={false}
              helperText={t('settings.email_locked', 'Your email is your sign-in ID. Contact support to change it.')}
            />
            <Button
              title={t('settings.save', 'Save changes')}
              onPress={handleSaveProfile}
              loading={savingProfile}
              disabled={!profileDirty || !!nameError || !!phoneError}
            />
          </Card>

          {/* Security */}
          <Card style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <KeyRound size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('settings.security', 'Password')}
              </Text>
            </View>
            {isDemo ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t('demo.unavailable', 'Not available in demo mode.')}
              </Text>
            ) : (
              <>
                <Input
                  label={t('settings.current_password', 'Current password')}
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  isPassword
                  textContentType="password"
                />
                <Input
                  label={t('settings.new_password', 'New password')}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  isPassword
                  textContentType="newPassword"
                />
                <Input
                  label={t('settings.confirm_password', 'Confirm new password')}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  isPassword
                  textContentType="newPassword"
                  error={passwordError}
                />
                <Button
                  title={t('settings.change_password', 'Change password')}
                  variant="outline"
                  onPress={handleChangePassword}
                  loading={savingPassword}
                  disabled={!canChangePassword}
                />
              </>
            )}
          </Card>

          {/* Preferences */}
          <Card style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Languages size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('settings.preferences', 'Preferences')}
              </Text>
            </View>
            <View style={styles.chipRow}>
              {LANGUAGES.map(({ code, label }) => {
                const active = currentLanguage === code;
                return (
                  <TouchableOpacity
                    key={code}
                    onPress={() => handleLanguage(code)}
                    style={[
                      styles.chip,
                      { borderColor: active ? colors.primary : colors.border },
                      active && { backgroundColor: colors.primary },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.row} onPress={toggleTheme} accessibilityRole="switch" accessibilityState={{ checked: isDark }}>
              {isDark ? <Moon size={18} color={colors.textSecondary} /> : <Sun size={18} color="#F59E0B" />}
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>
                {isDark ? t('settings.theme_dark', 'Dark theme') : t('settings.theme_light', 'Light theme')}
              </Text>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                {t('settings.switch', 'Switch')}
              </Text>
            </TouchableOpacity>
          </Card>

          {/* Session */}
          {isDemo ? null : (
            <Button
              title={t('settings.logout', 'Log out')}
              icon={<LogOut size={16} color={colors.primary} />}
              variant="outline"
              onPress={handleLogout}
            />
          )}

          {/* Danger zone */}
          <Card style={[styles.section, { borderColor: '#FCA5A5' }]} variant="outlined">
            <View style={styles.sectionTitleRow}>
              <Trash2 size={16} color="#EF4444" />
              <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>
                {t('settings.delete_account', 'Delete account')}
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {isDemo
                ? t('demo.unavailable', 'Not available in demo mode.')
                : `${t('settings.delete_body', 'Permanently closes your account and removes your personal details.')} ${deleteConsequence}`}
            </Text>
            <Button
              title={t('settings.delete_account', 'Delete account')}
              variant="danger"
              onPress={openDelete}
              disabled={isDemo}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheetModal
        visible={deleteVisible}
        onClose={() => !deleting && setDeleteVisible(false)}
        title={t('settings.delete_confirm_title', 'Delete your account?')}
        subtitle={t('settings.delete_confirm_sub', 'This cannot be undone.')}
      >
        <View style={{ gap: 12 }}>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{deleteConsequence}</Text>
          <Input
            label={t('settings.delete_password', 'Enter your password to confirm')}
            value={deletePassword}
            onChangeText={setDeletePassword}
            isPassword
            error={deleteError ?? undefined}
          />
          <Button
            title={t('settings.delete_forever', 'Delete my account')}
            variant="danger"
            onPress={handleDelete}
            loading={deleting}
            disabled={!deletePassword}
          />
          <Button
            title={t('common.cancel', 'Cancel')}
            variant="ghost"
            onPress={() => setDeleteVisible(false)}
            disabled={deleting}
          />
        </View>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    padding: 16,
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});

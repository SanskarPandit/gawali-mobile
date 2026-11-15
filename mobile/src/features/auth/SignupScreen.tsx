import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Input, Header } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { clearAuthError, registerCustomer } from '../../app/store/authSlice';

interface Props {
  navigation: any;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;

/** Public sign-up is for customers only. Dairies and gawalis are onboarded by the Gawali admin. */
export const SignupScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { isLoading, error } = useAppSelector((state) => state.auth);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  const cleanPhone = phone.replace(/[\s-]/g, '');
  const errors = {
    fullName: fullName.trim() ? undefined : t('signup.name_required', 'Enter your full name'),
    email: EMAIL_PATTERN.test(email.trim()) ? undefined : t('signup.email_invalid', 'Enter a valid email address'),
    phone:
      !cleanPhone || PHONE_PATTERN.test(cleanPhone)
        ? undefined
        : t('signup.phone_invalid', 'Enter a valid mobile number, e.g. +919876543210'),
    password: password.length >= 8 ? undefined : t('signup.password_short', 'Use at least 8 characters'),
    confirmPassword:
      confirmPassword === password ? undefined : t('signup.password_mismatch', 'Passwords do not match'),
  };
  const isValid = Object.values(errors).every((e) => !e);
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const handleSubmit = () => {
    setSubmitted(true);
    if (!isValid) return;
    dispatch(registerCustomer({ fullName, email, phone: cleanPhone, password }));
    // On success the root navigator switches to the customer app automatically.
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={t('signup.title', 'Create your account')} onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.lead, { color: colors.textSecondary }]}>
            {t('signup.lead', 'Sign up to manage your daily milk subscription, skip days and pay bills.')}
          </Text>

          <Input
            label={t('signup.full_name', 'Full name')}
            placeholder="e.g. Rahul Patil"
            value={fullName}
            onChangeText={setFullName}
            error={show('fullName')}
            autoCapitalize="words"
            textContentType="name"
          />
          <Input
            label={t('signup.email', 'Email')}
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            error={show('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />
          <Input
            label={t('signup.phone', 'Mobile number (optional)')}
            placeholder="+91 98765 43210"
            value={phone}
            onChangeText={setPhone}
            error={show('phone')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
          <Input
            label={t('signup.password', 'Password')}
            value={password}
            onChangeText={setPassword}
            error={show('password')}
            helperText={t('signup.password_hint', 'At least 8 characters')}
            isPassword
            textContentType="newPassword"
          />
          <Input
            label={t('signup.confirm_password', 'Confirm password')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={show('confirmPassword')}
            isPassword
            textContentType="newPassword"
          />

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          <Button
            title={t('signup.submit', 'Create account')}
            onPress={handleSubmit}
            loading={isLoading}
            style={styles.actionBtn}
          />

          <View style={[styles.note, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}>
            <Info size={16} color={colors.textSecondary} />
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>
              {t(
                'signup.partner_note',
                'Running a dairy or delivering for one? Dairy and gawali accounts are created by the Gawali team. Contact your admin for access.'
              )}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  actionBtn: {
    marginTop: 20,
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});

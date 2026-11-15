import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Milk, User, Store, Truck, ShieldCheck, CircleCheck } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { resetDemoServer } from '../../shared/api/demo/demoServer';
import { Button, Input, BottomSheetModal } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { clearAuthError, loginWithCredentials, setLanguage, startDemo, UserRole } from '../../app/store/authSlice';

interface Props {
  navigation: any;
}

const GUEST_ROLES = [
  {
    role: 'customer',
    Icon: User,
    labelKey: 'auth.role_customer',
    labelFallback: 'Customer',
    person: 'Rahul Patil • Baner, Pune',
    tint: '#10B981',
    bg: '#ECFDF5',
    badge: '#D1FAE5',
  },
  {
    role: 'dairy',
    Icon: Store,
    labelKey: 'auth.role_dairy',
    labelFallback: 'Dairy (Vendor)',
    person: 'Badhale Dairy & Farm',
    tint: '#3B82F6',
    bg: '#EFF6FF',
    badge: '#DBEAFE',
  },
  {
    role: 'delivery_boy',
    Icon: Truck,
    labelKey: 'auth.role_delivery',
    labelFallback: 'Delivery Partner',
    person: 'Suresh Kadam',
    tint: '#F59E0B',
    bg: '#FFFBEB',
    badge: '#FEF3C7',
  },
  {
    role: 'admin',
    Icon: ShieldCheck,
    labelKey: 'auth.role_admin',
    labelFallback: 'Platform Admin',
    person: 'Mahesh Garade',
    tint: '#A855F7',
    bg: '#FAF5FF',
    badge: '#F3E8FF',
  },
] as const satisfies ReadonlyArray<{ role: UserRole; [key: string]: unknown }>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { isLoading, error, currentLanguage } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  useEffect(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  const canLogin = email.trim().length > 0 && password.length > 0;

  const handleLogin = () => {
    if (!canLogin) return;
    dispatch(loginWithCredentials({ email, password }));
  };

  const openGuestModal = () => {
    setSelectedRole(null);
    setGuestModalVisible(true);
  };

  const handleGuestContinue = () => {
    if (!selectedRole) return;
    setGuestModalVisible(false);
    resetDemoServer(); // every demo starts from fresh sample data
    dispatch(startDemo(selectedRole));
  };

  const handleLanguageChange = (lang: 'en' | 'hi' | 'mr') => {
    dispatch(setLanguage(lang));
    i18n.changeLanguage(lang);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top + 16, 32), paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header & Language Picker */}
        <View style={styles.topRow}>
          <View style={styles.langSelector}>
            {(['en', 'mr', 'hi'] as const).map((lang) => (
              <TouchableOpacity
                key={lang}
                onPress={() => handleLanguageChange(lang)}
                style={[
                  styles.langBtn,
                  currentLanguage === lang && {
                    backgroundColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.langText,
                    {
                      color: currentLanguage === lang ? '#FFFFFF' : colors.textSecondary,
                      fontWeight: currentLanguage === lang ? '700' : '500',
                    },
                  ]}
                >
                  {lang === 'en' ? 'EN' : lang === 'mr' ? 'मराठी' : 'हिंदी'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={toggleTheme}
            style={[styles.themeBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
          >
            {isDark ? <Sun size={18} color="#F59E0B" /> : <Moon size={18} color={colors.textSecondary} />}
          </TouchableOpacity>
        </View>

        {/* Hero Branding */}
        <View style={styles.brandHero}>
          <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
            <Milk size={34} color="#FFFFFF" strokeWidth={2.2} />
          </View>
          <Text style={[styles.brandName, { color: colors.textPrimary }]}>
            {t('common.app_name', 'Gawali')}
          </Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            {t('common.tagline', 'Your milkman, in your pocket.')}
          </Text>
          <Text style={[styles.subTagline, { color: colors.primary }]}>
            {t('common.subtagline', 'Skip a day • Add extra • Pay later')}
          </Text>
        </View>

        {/* Traditional Credentials Form */}
        <View style={styles.formContainer}>
          <Text style={[styles.formHeader, { color: colors.textSecondary }]}>
            {t('auth.login_sub', 'Log in to your Gawali account.')}
          </Text>

          <Input
            label={t('auth.email', 'Email')}
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />

          <Input
            label={t('auth.password', 'Password')}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            isPassword
            textContentType="password"
            onSubmitEditing={handleLogin}
          />

          {error && <Text style={[styles.errorBanner, { color: colors.error }]}>{error}</Text>}

          <Button
            title={t('auth.login', 'Log In to Gawali')}
            onPress={handleLogin}
            loading={isLoading}
            disabled={!canLogin}
            style={styles.loginBtn}
          />

          <View style={styles.footerRow}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {t('auth.new_customer', 'New customer?')}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={[styles.signupLink, { color: colors.primary }]}>
                {' '}{t('auth.register_here', 'Register Here')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Continue with guest mode */}
          <TouchableOpacity onPress={openGuestModal} style={styles.guestLinkRow}>
            <Text style={[styles.guestLink, { color: colors.primary }]}>
              {t('auth.continue_guest_mode', 'Continue with guest mode')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Instant 1-Tap Demo Modal */}
      <BottomSheetModal
        visible={guestModalVisible}
        onClose={() => setGuestModalVisible(false)}
        title={t('auth.demo_title', 'Instant 1-Tap Demo Logins')}
        subtitle={t('auth.demo_subtitle', 'Select any persona to test full features immediately')}
      >
        <View style={styles.modalGrid}>
          {GUEST_ROLES.map(({ role, Icon, labelKey, labelFallback, person, tint, bg, badge }) => {
            const selected = selectedRole === role;
            return (
              <TouchableOpacity
                key={role}
                activeOpacity={0.7}
                onPress={() => setSelectedRole(role)}
                style={[
                  styles.modalDemoCard,
                  selected
                    ? { backgroundColor: bg, borderColor: tint }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.modalIconBadge, { backgroundColor: badge }]}>
                  <Icon size={22} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.demoRoleName, { color: selected ? '#1E293B' : colors.textPrimary }]}>
                    {t(labelKey, labelFallback)}
                  </Text>
                  <Text style={[styles.demoPerson, { color: selected ? '#64748B' : colors.textSecondary }]}>
                    {person}
                  </Text>
                </View>
                {selected && <CircleCheck size={22} color={tint} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Button
          title={t('auth.continue', 'Continue')}
          onPress={handleGuestContinue}
          disabled={!selectedRole}
          style={styles.guestContinueBtn}
        />
      </BottomSheetModal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  langSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 20,
    padding: 3,
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  langText: {
    fontSize: 12,
  },
  themeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandHero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EA371',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 12,
  },
  logoIcon: {
    fontSize: 34,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },
  subTagline: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  demoCard: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 20,
  },
  demoHeader: {
    marginBottom: 12,
  },
  demoTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  demoSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  demoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  demoButton: {
    width: '48%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  demoEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  demoRoleName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  demoPerson: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  formContainer: {
    width: '100%',
  },
  formHeader: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorBanner: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 8,
    fontWeight: '600',
  },
  loginBtn: {
    marginTop: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  signupLink: {
    fontWeight: '700',
    fontSize: 13,
  },
  guestLinkRow: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  guestLink: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  guestContinueBtn: {
    marginTop: 8,
  },
  modalGrid: {
    paddingVertical: 8,
    gap: 12,
  },
  modalDemoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  modalIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoRoleDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },
});

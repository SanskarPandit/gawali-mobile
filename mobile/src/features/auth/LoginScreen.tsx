import React, { useState } from 'react';
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
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Input, Card } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { quickDemoLogin, loginWithCredentials, setLanguage, UserRole } from '../../app/store/authSlice';

interface Props {
  navigation: any;
}

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { isLoading, error, currentLanguage } = useAppSelector((state) => state.auth);

  const [identifier, setIdentifier] = useState('shailesh.badhale@gawali.app');
  const [password, setPassword] = useState('Gawali@12345');

  const handleLogin = () => {
    dispatch(loginWithCredentials({ emailOrPhone: identifier, password }));
  };

  const handleQuickDemo = (role: UserRole) => {
    dispatch(quickDemoLogin(role));
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
            <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Branding */}
        <View style={styles.brandHero}>
          <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.logoIcon}>🥛</Text>
          </View>
          <Text style={[styles.brandName, { color: colors.textPrimary }]}>Gawali</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            {t('tagline', 'Your milkman, in your pocket.')}
          </Text>
          <Text style={[styles.subTagline, { color: colors.primary }]}>
            Skip a day • Add extra • Pay later
          </Text>
        </View>

        {/* Quick Demo Logins Section */}
        <Card style={styles.demoCard} variant="outlined">
          <View style={styles.demoHeader}>
            <Text style={[styles.demoTitle, { color: colors.textPrimary }]}>
              ⚡ Instant 1-Tap Demo Logins
            </Text>
            <Text style={[styles.demoSubtitle, { color: colors.textMuted }]}>
              Select any role to test full enterprise features immediately
            </Text>
          </View>

          <View style={styles.demoGrid}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleQuickDemo('customer')}
              style={[styles.demoButton, { backgroundColor: '#ECFDF5', borderColor: '#10B981' }]}
            >
              <Text style={styles.demoEmoji}>👤</Text>
              <Text style={styles.demoRoleName}>Customer</Text>
              <Text style={styles.demoPerson}>Rahul Patil</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleQuickDemo('dairy')}
              style={[styles.demoButton, { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }]}
            >
              <Text style={styles.demoEmoji}>🥛</Text>
              <Text style={styles.demoRoleName}>Dairy (Vendor)</Text>
              <Text style={styles.demoPerson}>Badhale Dairy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleQuickDemo('delivery_boy')}
              style={[styles.demoButton, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }]}
            >
              <Text style={styles.demoEmoji}>🚚</Text>
              <Text style={styles.demoRoleName}>Delivery Boy</Text>
              <Text style={styles.demoPerson}>Suresh Kadam</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleQuickDemo('admin')}
              style={[styles.demoButton, { backgroundColor: '#FAF5FF', borderColor: '#A855F7' }]}
            >
              <Text style={styles.demoEmoji}>👑</Text>
              <Text style={styles.demoRoleName}>Admin</Text>
              <Text style={styles.demoPerson}>Mahesh Garade</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Traditional Credentials Form */}
        <View style={styles.formContainer}>
          <Text style={[styles.formHeader, { color: colors.textSecondary }]}>
            Or log in with your credentials
          </Text>

          <Input
            label="Email or Mobile Number"
            placeholder="e.g. shailesh.badhale@gawali.app"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
          />

          <Input
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            isPassword
          />

          {error && <Text style={[styles.errorBanner, { color: colors.error }]}>{error}</Text>}

          <Button
            title="Log In to Gawali"
            onPress={handleLogin}
            loading={isLoading}
            style={styles.loginBtn}
          />

          <View style={styles.footerRow}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>New customer or dairy?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={[styles.signupLink, { color: colors.primary }]}> Register Here</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
});

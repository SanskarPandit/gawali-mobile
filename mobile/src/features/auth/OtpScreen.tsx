import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Input, Header } from '../../shared/ui';
import { useAppDispatch } from '../../app/store';
import { quickDemoLogin } from '../../app/store/authSlice';

interface Props {
  route: any;
  navigation: any;
}

export const OtpScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const phoneOrEmail = route?.params?.phoneOrEmail || '+91 98765 43212';

  const [otp, setOtp] = useState('');

  const handleVerify = () => {
    // In mock/demo mode, verify instantly and login as customer
    dispatch(quickDemoLogin('customer'));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Verify Mobile Number" onBack={() => navigation.goBack()} />

      <View style={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.topInfo}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Enter 6-digit OTP</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We sent a verification code via SMS and WhatsApp to{' '}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{phoneOrEmail}</Text>
          </Text>
        </View>

        <Input
          placeholder="• • • • • •"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
          style={styles.otpInput}
        />

        <TouchableOpacity style={styles.resendRow}>
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
            Resend OTP in 24s
          </Text>
        </TouchableOpacity>

        <Button
          title="Verify & Start Subscription"
          onPress={handleVerify}
          style={styles.verifyBtn}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  topInfo: {
    marginVertical: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  otpInput: {
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 12,
    fontWeight: '700',
    height: 56,
  },
  resendRow: {
    alignItems: 'center',
    marginVertical: 16,
  },
  verifyBtn: {
    marginTop: 10,
  },
});

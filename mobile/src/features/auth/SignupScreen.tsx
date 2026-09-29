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
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Input, Header } from '../../shared/ui';

interface Props {
  navigation: any;
}

export const SignupScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [role, setRole] = useState<'customer' | 'dairy'>('customer');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dairyName, setDairyName] = useState('');
  const [address, setAddress] = useState('');

  const handleNext = () => {
    navigation.navigate('Otp', { phoneOrEmail: phone || '+919876543210' });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Create Gawali Account" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Role selection tab */}
          <View style={styles.roleSwitchContainer}>
            <TouchableOpacity
              onPress={() => setRole('customer')}
              style={[
                styles.roleTab,
                role === 'customer' && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.roleTabText,
                  { color: role === 'customer' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                👤 Customer / Family
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setRole('dairy')}
              style={[
                styles.roleTab,
                role === 'dairy' && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.roleTabText,
                  { color: role === 'dairy' ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                🥛 Dairy / Vendor
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Full Name"
            placeholder="e.g. Rahul Patil"
            value={fullName}
            onChangeText={setFullName}
          />

          <Input
            label="Mobile Number (WhatsApp Enabled)"
            placeholder="+91 98765 43210"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          {role === 'dairy' ? (
            <Input
              label="Dairy Business Name"
              placeholder="e.g. Badhale Fresh Milk Dairy"
              value={dairyName}
              onChangeText={setDairyName}
            />
          ) : (
            <Input
              label="Flat / House No & Society Address"
              placeholder="e.g. Flat 402, Green Acres, Baner"
              value={address}
              onChangeText={setAddress}
            />
          )}

          <Button
            title="Continue to Verify OTP"
            onPress={handleNext}
            style={styles.actionBtn}
          />
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
  roleSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  roleTabText: {
    fontWeight: '700',
    fontSize: 13,
  },
  actionBtn: {
    marginTop: 20,
  },
});

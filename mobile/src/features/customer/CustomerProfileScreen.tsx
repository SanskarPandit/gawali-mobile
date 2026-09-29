import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, Button, Input } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { logout, setLanguage, quickDemoLogin, UserRole } from '../../app/store/authSlice';

export const CustomerProfileScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { user, currentLanguage } = useAppSelector((state) => state.auth);

  const [deliveryNote, setDeliveryNote] = useState(
    'Ring bell once and leave in milk bag on door handle'
  );

  const handleLanguageChange = (lang: 'en' | 'hi' | 'mr') => {
    dispatch(setLanguage(lang));
    i18n.changeLanguage(lang);
  };

  const handleSaveNotes = () => {
    Alert.alert('Saved', 'Delivery instructions updated for your delivery partner.');
  };

  const handleSupportTicket = () => {
    Alert.alert(
      'Raise Complaint / Help',
      'Select issue type:\n1. Milk not delivered\n2. Quality / curdling issue\n3. Wrong quantity delivered\n4. Billing question',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Notify Dairy on WhatsApp',
          onPress: () =>
            Linking.openURL(
              'https://wa.me/919876543211?text=Hi%20Badhale%20Dairy,%20I%20have%20an%20issue%20with%20today%27s%20delivery.'
            ),
        },
      ]
    );
  };

  const handleSwitchDemo = (role: UserRole) => {
    dispatch(quickDemoLogin(role));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="My Account" subtitle="Profile & Delivery Preferences" />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <Card style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{(user?.fullName || 'R').charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>
                {user?.fullName || 'Rahul Patil'}
              </Text>
              <Text style={[styles.userContact, { color: colors.textSecondary }]}>
                {user?.phone || '+91 98765 43212'}
              </Text>
              <Text style={[styles.userEmail, { color: colors.textMuted }]}>
                {user?.email || 'rahul.patil@example.com'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Delivery Address & GPS Coordinates */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            📍 Delivery Address & Location
          </Text>
          <Text style={[styles.addressText, { color: colors.textSecondary }]}>
            {user?.deliveryAddress || 'Flat 402, Green Acres, Baner Road, Pune - 411045'}
          </Text>
          <View style={styles.gpsRow}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              GPS Pin: {user?.latitude || 18.559658}, {user?.longitude || 73.779434}
            </Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  `https://maps.google.com/?q=${user?.latitude || 18.559658},${user?.longitude || 73.779434}`
                )
              }
            >
              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
                Open in Maps ›
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Special Delivery Instructions"
            value={deliveryNote}
            onChangeText={setDeliveryNote}
            placeholder="e.g. Ring bell and leave on pouch"
          />

          <Button
            title="Save Instructions"
            variant="outline"
            size="sm"
            onPress={handleSaveNotes}
            style={{ marginTop: 6 }}
          />
        </Card>

        {/* Assigned Dairy Vendor */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            🥛 Assigned Milk Vendor
          </Text>
          <Text style={[styles.dairyName, { color: colors.textPrimary }]}>
            {user?.dairyName || 'Badhale Dairy & Farm'}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>
            Direct supplier since August 2026
          </Text>

          <View style={styles.contactRow}>
            <Button
              title="💬 WhatsApp Vendor"
              variant="outline"
              size="sm"
              onPress={() => Linking.openURL('https://wa.me/919876543211')}
              style={{ flex: 1 }}
            />
            <Button
              title="📞 Call Vendor"
              variant="outline"
              size="sm"
              onPress={() => Linking.openURL('tel:+919876543211')}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* App Settings: Language & Theme */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            ⚙️ App Preferences
          </Text>

          {/* Language Selector */}
          <View style={styles.prefRow}>
            <Text style={[styles.prefLabel, { color: colors.textSecondary }]}>Language</Text>
            <View style={styles.langSelector}>
              {(['en', 'mr', 'hi'] as const).map((lang) => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => handleLanguageChange(lang)}
                  style={[
                    styles.langChip,
                    currentLanguage === lang && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      { color: currentLanguage === lang ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {lang === 'en' ? 'English' : lang === 'mr' ? 'मराठी' : 'हिंदी'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Dark / Light Mode */}
          <View style={[styles.prefRow, { marginTop: 14 }]}>
            <Text style={[styles.prefLabel, { color: colors.textSecondary }]}>Theme Appearance</Text>
            <TouchableOpacity
              onPress={toggleTheme}
              style={[styles.themeChip, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                {isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Complaints & Help */}
        <Card style={styles.sectionCard} onPress={handleSupportTicket}>
          <View style={styles.prefRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                🛎️ Help & Complaints
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                Report missed delivery, quality issues or billing disputes
              </Text>
            </View>
            <Text style={{ fontSize: 20, color: colors.textMuted }}>›</Text>
          </View>
        </Card>

        {/* Quick Demo Switcher */}
        <Card style={styles.demoCard} variant="outlined">
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            ⚡ Switch Demo Role
          </Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
            Instantly preview other user portals in this running app:
          </Text>

          <View style={styles.demoPills}>
            <TouchableOpacity
              onPress={() => handleSwitchDemo('dairy')}
              style={[styles.demoPill, { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }]}
            >
              <Text style={styles.demoPillText}>🥛 Badhale Dairy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSwitchDemo('delivery_boy')}
              style={[styles.demoPill, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }]}
            >
              <Text style={styles.demoPillText}>🚚 Delivery Boy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSwitchDemo('admin')}
              style={[styles.demoPill, { backgroundColor: '#FAF5FF', borderColor: '#A855F7' }]}
            >
              <Text style={styles.demoPillText}>👑 Admin</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Logout */}
        <Button
          title="Log Out of Gawali"
          variant="outline"
          onPress={() => dispatch(logout())}
          style={{ borderColor: '#EF4444', marginTop: 8 }}
          textStyle={{ color: '#EF4444' }}
        />
      </ScrollView>
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
  userCard: {
    padding: 18,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
  },
  userContact: {
    fontSize: 13,
    marginTop: 2,
  },
  userEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionCard: {
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  addressText: {
    fontSize: 14,
    lineHeight: 20,
  },
  gpsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dairyName: {
    fontSize: 16,
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prefLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  langSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 3,
    gap: 4,
  },
  langChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  langChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  themeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  demoCard: {
    padding: 16,
    borderRadius: 16,
  },
  demoPills: {
    flexDirection: 'row',
    gap: 8,
  },
  demoPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  demoPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ChevronRight, HelpCircle, MapPin, Settings, Store } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Card, Header, Input, LoadState, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { errorMessage, fieldErrorsOf } from '../../shared/ui/QueryStates';
import { SettingsHeaderButton } from '../settings/SettingsHeaderButton';
import {
  useGetCustomerDashboardQuery,
  useGetCustomerProfileQuery,
  useUpdateCustomerProfileMutation,
} from '../../shared/api/gawaliApi';

export const CustomerProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const profile = useGetCustomerProfileQuery();
  const dashboard = useGetCustomerDashboardQuery();
  const [save, { isLoading: saving, error: saveError }] = useUpdateCustomerProfileMutation();
  const refreshControl = usePullToRefresh(profile.refetch);

  const [address, setAddress] = useState('');
  const [flat, setFlat] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');

  const p = profile.data;
  useEffect(() => {
    if (p) {
      setAddress(p.address);
      setFlat(p.flat_or_house_number);
      setLandmark(p.landmark);
      setInstructions(p.delivery_instructions);
    }
  }, [p]);

  const dirty =
    !!p &&
    (address !== p.address || flat !== p.flat_or_house_number || landmark !== p.landmark || instructions !== p.delivery_instructions);
  const fieldErrors = fieldErrorsOf(saveError);

  const onSave = async () => {
    try {
      await save({ address, flat_or_house_number: flat, landmark, delivery_instructions: instructions }).unwrap();
      Alert.alert(t('settings.saved_title', 'Saved'), t('profile.saved', 'Your gawali will see the new details from the next delivery.'));
    } catch (e) {
      Alert.alert(t('settings.error_title', 'Something went wrong'), errorMessage(e));
    }
  };

  const dairyPhone = dashboard.data?.dairy?.phone ?? '';
  const help = () => {
    if (!dairyPhone) return;
    Alert.alert(
      t('profile.help', 'Help with a delivery'),
      t('profile.help_body', 'Message or call your dairy about missed deliveries, quality or billing.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('customer_home.call', 'Call'), onPress: () => Linking.openURL(`tel:${dairyPhone}`) },
        { text: 'WhatsApp', onPress: () => Linking.openURL(`https://wa.me/${dairyPhone.replace(/\D/g, '')}`) },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('customer_profile.title', 'My account')}
        subtitle={t('profile.subtitle', 'Delivery details')}
        rightAction={<SettingsHeaderButton onPress={() => navigation.navigate('CustomerSettings')} />}
      />

      <LoadState isLoading={profile.isLoading} error={profile.error} hasData={!!p} onRetry={profile.refetch}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
            refreshControl={refreshControl}
            keyboardShouldPersistTaps="handled"
          >
            <StaleBanner error={profile.error} />

            {p && (
              <Card style={styles.identity}>
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarText}>{p.full_name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{p.full_name}</Text>
                  <Text style={[styles.muted, { color: colors.textSecondary }]}>{p.phone ?? ''}</Text>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>{p.email}</Text>
                </View>
              </Card>
            )}

            {p?.dairy_name && (
              <Card style={styles.section}>
                <View style={styles.titleRow}>
                  <Store size={16} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('profile.dairy', 'Your dairy')}</Text>
                </View>
                <Text style={[styles.value, { color: colors.textPrimary }]}>{p.dairy_name}</Text>
                <Text style={[styles.muted, { color: colors.textSecondary }]}>
                  {p.route_name
                    ? t('profile.route', 'Route: {{route}} · stop {{stop}}', { route: p.route_name, stop: p.route_stop_order })
                    : t('profile.no_route', 'Your dairy will assign you to a delivery route.')}
                </Text>
              </Card>
            )}

            <Card style={styles.section}>
              <View style={styles.titleRow}>
                <MapPin size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('profile.address', 'Delivery address')}</Text>
              </View>
              <Input label={t('profile.flat', 'Flat / house no.')} value={flat} onChangeText={setFlat} error={fieldErrors.flat_or_house_number} />
              <Input label={t('profile.street', 'Society, street, area')} value={address} onChangeText={setAddress} error={fieldErrors.address} multiline />
              <Input label={t('profile.landmark', 'Landmark (optional)')} value={landmark} onChangeText={setLandmark} />
              <Input
                label={t('profile.instructions', 'Instructions for your gawali')}
                placeholder={t('profile.instructions_ph', 'e.g. Ring bell once, leave bag on the door handle')}
                value={instructions}
                onChangeText={setInstructions}
                multiline
              />
              <Button title={t('settings.save', 'Save changes')} onPress={onSave} loading={saving} disabled={!dirty || !address.trim()} />
            </Card>

            <Card style={styles.linkCard} onPress={help}>
              <HelpCircle size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('profile.help', 'Help with a delivery')}</Text>
                <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('profile.help_sub', 'Missed delivery, quality or billing question')}</Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Card>

            <Card style={styles.linkCard} onPress={() => navigation.navigate('CustomerSettings')}>
              <Settings size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('settings.title', 'Settings')}</Text>
                <Text style={[styles.muted, { color: colors.textSecondary }]}>
                  {t('settings.entry_sub', 'Edit your details, change password, log out or delete your account')}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </LoadState>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '700' },
  muted: { fontSize: 12, marginTop: 2 },
  section: { padding: 16, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  value: { fontSize: 15, fontWeight: '600' },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
});

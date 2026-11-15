import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Clock } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, Button, Card, Header, Input, LoadState } from '../../shared/ui';
import { errorMessage, fieldErrorsOf } from '../../shared/ui/QueryStates';
import { useGetDairyProfileQuery, useUpdateDairyProfileMutation } from '../../shared/api/gawaliApi';
import type { DairyProfile } from '../../shared/api/types';

const CUTOFFS = ['18:00:00', '19:00:00', '20:00:00', '21:00:00', '22:00:00', '23:00:00'];
const CYCLES: DairyProfile['billing_cycle'][] = ['monthly', 'fortnightly', 'weekly'];

const to12h = (hhmmss: string) => {
  const [h, m] = hhmmss.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const DairyBusinessProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const profile = useGetDairyProfileQuery();
  const [save, { isLoading, error }] = useUpdateDairyProfileMutation();
  const fieldErrors = fieldErrorsOf(error);

  const [form, setForm] = useState<Partial<DairyProfile>>({});
  const p = profile.data;
  useEffect(() => {
    if (p) {
      setForm({
        business_name: p.business_name,
        phone: p.phone,
        address: p.address,
        city: p.city,
        pincode: p.pincode,
        cutoff_time: p.cutoff_time,
        billing_cycle: p.billing_cycle,
        bank_upi_id: p.bank_upi_id,
      });
    }
  }, [p]);

  const set = (k: keyof DairyProfile) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = !!p && Object.entries(form).some(([k, v]) => (p as any)[k] !== v);

  const onSave = async () => {
    try {
      await save(form).unwrap();
      Alert.alert(t('settings.saved_title', 'Saved'), t('dairy.profile_saved', 'Your business details are updated.'));
    } catch (e) {
      if (!Object.keys(fieldErrorsOf(e)).length) Alert.alert(t('settings.error_title', 'Something went wrong'), errorMessage(e));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={t('dairy.business', 'Business profile')} onBack={() => navigation.goBack()} />
      <LoadState isLoading={profile.isLoading} error={profile.error} hasData={!!p} onRetry={profile.refetch}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            {p && (
              <Card style={styles.statusCard}>
                <BadgeCheck size={20} color={p.is_verified ? colors.primary : colors.textMuted} />
                <Text style={[styles.statusText, { color: colors.textSecondary }]}>
                  {p.is_verified
                    ? t('dairy.verified', 'Verified by Gawali. Customers can find you.')
                    : t('dairy.unverified', 'Waiting for verification. New customers cannot find you yet.')}
                </Text>
                <Badge label={p.is_active ? t('admin_dashboard.active_badge', 'Active') : t('admin_dashboard.suspended_badge', 'Suspended')} variant={p.is_active ? 'success' : 'error'} size="sm" />
              </Card>
            )}

            <Card style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.details', 'Business details')}</Text>
              <Input label={t('admin_dashboard.dairy_name_label', 'Dairy name')} value={form.business_name ?? ''} onChangeText={set('business_name')} error={fieldErrors.business_name} />
              <Input label={t('settings.phone', 'Mobile number')} value={form.phone ?? ''} onChangeText={set('phone')} error={fieldErrors.phone} keyboardType="phone-pad" />
              <Input label={t('dairy.address', 'Address')} value={form.address ?? ''} onChangeText={set('address')} error={fieldErrors.address} multiline />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Input label={t('admin_dashboard.city_label', 'City')} value={form.city ?? ''} onChangeText={set('city')} error={fieldErrors.city} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label={t('dairy.pincode', 'PIN code')} value={form.pincode ?? ''} onChangeText={set('pincode')} error={fieldErrors.pincode} keyboardType="number-pad" maxLength={6} />
                </View>
              </View>
            </Card>

            <Card style={styles.section}>
              <View style={styles.titleRow}>
                <Clock size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.cutoff', 'Order cutoff')}</Text>
              </View>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                {t('dairy.cutoff_help', 'Customers can skip or change tomorrow’s milk until this time tonight. After it, tomorrow’s list is final.')}
              </Text>
              <View style={styles.wrap}>
                {CUTOFFS.map((c) => {
                  const active = form.cutoff_time === c;
                  return (
                    <TouchableOpacity key={c} onPress={() => set('cutoff_time')(c)} style={[styles.chip, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}>
                      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{to12h(c)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {fieldErrors.cutoff_time ? <Text style={[styles.error, { color: colors.error }]}>{fieldErrors.cutoff_time}</Text> : null}
            </Card>

            <Card style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.payments', 'Payments')}</Text>
              <Input
                label={t('dairy.upi', 'UPI ID for customer payments')}
                placeholder="dairyname@upi"
                value={form.bank_upi_id ?? ''}
                onChangeText={set('bank_upi_id')}
                error={fieldErrors.bank_upi_id}
                autoCapitalize="none"
                autoCorrect={false}
                helperText={t('dairy.upi_help', 'Customers pay their bills to this UPI ID from the app.')}
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('dairy.cycle', 'Billing cycle')}</Text>
              <View style={styles.wrap}>
                {CYCLES.map((c) => {
                  const active = form.billing_cycle === c;
                  return (
                    <TouchableOpacity key={c} onPress={() => setForm((f) => ({ ...f, billing_cycle: c }))} style={[styles.chip, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}>
                      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                        {{ monthly: t('dairy.monthly', 'Monthly'), fortnightly: t('dairy.fortnightly', 'Fortnightly'), weekly: t('dairy.weekly', 'Weekly') }[c]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>

            <Button title={t('settings.save', 'Save changes')} onPress={onSave} loading={isLoading} disabled={!dirty} />
          </ScrollView>
        </KeyboardAvoidingView>
      </LoadState>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  statusText: { flex: 1, fontSize: 13 },
  section: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  muted: { fontSize: 12, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 12, fontWeight: '600' },
});

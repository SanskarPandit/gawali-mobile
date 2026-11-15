import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Check, Milk, Search, Store } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, Header, Input, LoadState, QuantityStepper } from '../../shared/ui';
import { errorMessage, fieldErrorsOf } from '../../shared/ui/QueryStates';
import { SettingsHeaderButton } from '../settings/SettingsHeaderButton';
import { useGetPublicDairiesQuery, useGetPublicDairyProductsQuery, useSetupCustomerMutation } from '../../shared/api/gawaliApi';
import type { TimeSlot } from '../../shared/api/types';
import { formatCurrency } from '../../shared/utils/formatters';

/** First-run setup for a customer: pick a dairy, a daily plan and the delivery address. */
export const CustomerOnboardingScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const [dairyId, setDairyId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [slot, setSlot] = useState<TimeSlot>('morning');
  const [flat, setFlat] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');

  const dairies = useGetPublicDairiesQuery(search.trim().length >= 2 ? { search: search.trim() } : undefined);
  const products = useGetPublicDairyProductsQuery(dairyId ?? '', { skip: !dairyId });
  const [setup, { isLoading: saving, error }] = useSetupCustomerMutation();
  const fieldErrors = fieldErrorsOf(error);

  const milkOptions = (products.data ?? []).filter((p) => p.kind === 'subscription');
  const canSubmit = !!dairyId && !!productId && address.trim().length > 0;

  const submit = async () => {
    if (!dairyId || !productId) return;
    try {
      const res = await setup({
        dairy_id: dairyId,
        product_id: productId,
        default_quantity: qty.toFixed(2),
        delivery_time_slot: slot,
        address: address.trim(),
        flat_or_house_number: flat.trim(),
        landmark: landmark.trim(),
        delivery_instructions: instructions.trim(),
      }).unwrap();
      Alert.alert(t('onboarding.done', 'You are all set'), res.message);
      // The customer app replaces this screen automatically once the profile is complete.
    } catch (e) {
      Alert.alert(t('onboarding.not_saved', 'Could not finish setup'), errorMessage(e));
    }
  };

  const step = (n: number, title: string) => (
    <View style={styles.stepRow}>
      <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('onboarding.title', 'Set up your milk delivery')}
        subtitle={t('onboarding.subtitle', 'Takes about a minute')}
        rightAction={<SettingsHeaderButton onPress={() => navigation.navigate('CustomerSettings')} />}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          {/* 1. Dairy */}
          <Card style={styles.section}>
            {step(1, t('onboarding.choose_dairy', 'Choose your dairy'))}
            <Input
              placeholder={t('onboarding.search', 'Search by dairy name or city')}
              value={search}
              onChangeText={setSearch}
              leftIcon={<Search size={16} color={colors.textMuted} />}
            />
            <LoadState isLoading={dairies.isLoading} error={dairies.error} hasData={!!dairies.data} onRetry={dairies.refetch}>
              {(dairies.data ?? []).length === 0 ? (
                <EmptyState
                  icon={<Store size={28} color={colors.textMuted} />}
                  title={t('onboarding.no_dairies', 'No dairies found')}
                  body={t('onboarding.no_dairies_body', 'Try another name, or ask your dairy to join Gawali.')}
                />
              ) : (
                (dairies.data ?? []).map((d) => {
                  const selected = dairyId === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => {
                        setDairyId(d.id);
                        setProductId(null);
                      }}
                      style={[styles.option, { borderColor: selected ? colors.primary : colors.border }, selected && { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Store size={18} color={selected ? colors.primary : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{d.business_name}</Text>
                        <Text style={[styles.muted, { color: colors.textSecondary }]}>
                          {d.city} · {t('onboarding.cutoff', 'changes until {{time}}', { time: d.cutoff_time.slice(0, 5) })}
                        </Text>
                      </View>
                      {selected && <Check size={18} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </LoadState>
          </Card>

          {/* 2. Plan */}
          {dairyId && (
            <Card style={styles.section}>
              {step(2, t('onboarding.choose_milk', 'Your daily milk'))}
              <LoadState isLoading={products.isLoading} error={products.error} hasData={!!products.data} onRetry={products.refetch}>
                {milkOptions.length === 0 ? (
                  <Text style={[styles.muted, { color: colors.textMuted }]}>{t('onboarding.no_milk', 'This dairy has no daily milk plans yet.')}</Text>
                ) : (
                  milkOptions.map((p) => {
                    const selected = productId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setProductId(p.id)}
                        style={[styles.option, { borderColor: selected ? colors.primary : colors.border }, selected && { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <Milk size={18} color={selected ? colors.primary : colors.textMuted} />
                        <Text style={[styles.optionTitle, { color: colors.textPrimary, flex: 1 }]}>{p.name}</Text>
                        <Text style={[styles.price, { color: colors.primary }]}>
                          {formatCurrency(p.price_per_unit)}/{p.unit}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </LoadState>
              {fieldErrors.product_id ? <Text style={[styles.error, { color: colors.error }]}>{fieldErrors.product_id}</Text> : null}
              {productId && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('onboarding.per_day', 'Quantity per day')}</Text>
                  <View style={{ alignItems: 'center' }}>
                    <QuantityStepper value={qty} onChange={setQty} step={0.25} min={0.25} max={20} unit={milkOptions.find((p) => p.id === productId)?.unit ?? 'L'} size="lg" />
                  </View>
                  <View style={styles.slotRow}>
                    {(['morning', 'evening'] as const).map((s) => {
                      const active = slot === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => setSlot(s)}
                          style={[styles.slot, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}
                        >
                          <Text style={{ fontWeight: '700', color: active ? '#FFFFFF' : colors.textSecondary }}>
                            {s === 'morning' ? t('onboarding.morning', 'Morning') : t('onboarding.evening', 'Evening')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </Card>
          )}

          {/* 3. Address */}
          {productId && (
            <Card style={styles.section}>
              {step(3, t('onboarding.address', 'Delivery address'))}
              <Input label={t('profile.flat', 'Flat / house no.')} value={flat} onChangeText={setFlat} />
              <Input label={t('profile.street', 'Society, street, area')} value={address} onChangeText={setAddress} error={fieldErrors.address} multiline />
              <Input label={t('profile.landmark', 'Landmark (optional)')} value={landmark} onChangeText={setLandmark} />
              <Input
                label={t('profile.instructions', 'Instructions for your gawali')}
                placeholder={t('profile.instructions_ph', 'e.g. Ring bell once, leave bag on the door handle')}
                value={instructions}
                onChangeText={setInstructions}
                multiline
              />
            </Card>
          )}

          <Button title={t('onboarding.start', 'Start my deliveries')} onPress={submit} loading={saving} disabled={!canSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  section: { padding: 16, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  stepTitle: { fontSize: 16, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  optionTitle: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 12, marginTop: 2 },
  price: { fontSize: 13, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  slotRow: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  error: { fontSize: 12, fontWeight: '600' },
});

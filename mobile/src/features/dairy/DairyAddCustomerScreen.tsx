import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Check, Milk } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Card, Header, Input, QuantityStepper } from '../../shared/ui';
import { errorMessage, fieldErrorsOf } from '../../shared/ui/QueryStates';
import { useAddDairyCustomerMutation, useGetProductsQuery, useGetRoutesQuery } from '../../shared/api/gawaliApi';
import type { TimeSlot } from '../../shared/api/types';
import { formatCurrency } from '../../shared/utils/formatters';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9]{10,15}$/;

export const DairyAddCustomerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const products = useGetProductsQuery();
  const routes = useGetRoutesQuery();
  const [add, { isLoading, error }] = useAddDairyCustomerMutation();
  const serverErrors = fieldErrorsOf(error);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [flat, setFlat] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');
  const [routeId, setRouteId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [slot, setSlot] = useState<TimeSlot>('morning');
  const [submitted, setSubmitted] = useState(false);

  const milk = (products.data ?? []).filter((p) => p.kind === 'subscription' && p.is_available);
  const cleanPhone = phone.replace(/[\s-]/g, '');
  const errors: Record<string, string | undefined> = {
    full_name: name.trim() ? undefined : t('dairy.err_name', 'Enter the customer name'),
    email: EMAIL.test(email.trim()) ? undefined : t('dairy.err_email', 'Enter a valid email (their sign-in ID)'),
    phone: PHONE.test(cleanPhone) ? undefined : t('dairy.err_phone', 'Enter a valid mobile number'),
    address: address.trim() ? undefined : t('dairy.err_address', 'Enter the address'),
    product_id: productId ? undefined : t('dairy.err_product', 'Choose the daily milk'),
  };
  const show = (k: string) => serverErrors[k] ?? (submitted ? errors[k] : undefined);

  const submit = async () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || !productId) return;
    try {
      const created = await add({
        full_name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        flat_or_house_number: flat.trim(),
        address: address.trim(),
        landmark: landmark.trim(),
        delivery_instructions: instructions.trim(),
        delivery_route: routeId,
        product_id: productId,
        default_quantity: qty.toFixed(2),
        delivery_time_slot: slot,
      }).unwrap();
      const body = created.temporary_password
        ? t('dairy.created_new', 'Share these sign-in details with {{name}} privately. The password is shown only once.\n\nEmail: {{email}}\nTemporary password: {{password}}', {
            name: created.full_name,
            email: created.email,
            password: created.temporary_password,
          })
        : t('dairy.created_linked', '{{name}} already had a Gawali account. Their plan is now with your dairy.', { name: created.full_name });
      Alert.alert(t('dairy.created', 'Household added'), body, [
        { text: t('common.ok', 'OK'), onPress: () => navigation.replace('DairyCustomerDetail', { customerId: created.id }) },
      ]);
    } catch (e) {
      if (!Object.keys(fieldErrorsOf(e)).length) Alert.alert(t('dairy.not_created', 'Could not add'), errorMessage(e));
    }
  };

  const chip = (active: boolean) => [
    styles.chip,
    { borderColor: active ? colors.primary : colors.border },
    active && { backgroundColor: colors.primary },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={t('dairy.add_customer', 'Add a household')} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <Card style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.contact', 'Contact')}</Text>
            <Input label={t('settings.full_name', 'Full name')} value={name} onChangeText={setName} error={show('full_name')} autoCapitalize="words" />
            <Input label={t('settings.phone', 'Mobile number')} value={phone} onChangeText={setPhone} error={show('phone')} keyboardType="phone-pad" />
            <Input
              label={t('dairy.email_signin', 'Email (their sign-in ID)')}
              value={email}
              onChangeText={setEmail}
              error={show('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Card>

          <Card style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('profile.address', 'Delivery address')}</Text>
            <Input label={t('profile.flat', 'Flat / house no.')} value={flat} onChangeText={setFlat} />
            <Input label={t('profile.street', 'Society, street, area')} value={address} onChangeText={setAddress} error={show('address')} multiline />
            <Input label={t('profile.landmark', 'Landmark (optional)')} value={landmark} onChangeText={setLandmark} />
            <Input label={t('profile.instructions', 'Instructions for your gawali')} value={instructions} onChangeText={setInstructions} multiline />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('dairy.route', 'Route')}</Text>
            <View style={styles.wrap}>
              <TouchableOpacity onPress={() => setRouteId(null)} style={chip(routeId === null)}>
                <Text style={[styles.chipText, { color: routeId === null ? '#FFFFFF' : colors.textSecondary }]}>{t('dairy.decide_later', 'Decide later')}</Text>
              </TouchableOpacity>
              {(routes.data ?? []).map((r) => (
                <TouchableOpacity key={r.id} onPress={() => setRouteId(r.id)} style={chip(routeId === r.id)}>
                  <Text style={[styles.chipText, { color: routeId === r.id ? '#FFFFFF' : colors.textSecondary }]}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.plan', 'Daily plan')}</Text>
            {milk.length === 0 ? (
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                {t('dairy.no_milk', 'Add a daily milk product in the Products tab first.')}
              </Text>
            ) : (
              milk.map((p) => {
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
                    <Text style={[styles.optionText, { color: colors.textPrimary }]}>{p.name}</Text>
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>
                      {formatCurrency(p.price_per_unit)}/{p.unit}
                    </Text>
                    {selected && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })
            )}
            {show('product_id') ? <Text style={[styles.error, { color: colors.error }]}>{show('product_id')}</Text> : null}
            <View style={{ alignItems: 'center' }}>
              <QuantityStepper value={qty} onChange={setQty} step={0.25} min={0.25} max={20} unit={milk.find((p) => p.id === productId)?.unit ?? 'L'} size="lg" />
            </View>
            <View style={styles.wrap}>
              {(['morning', 'evening'] as const).map((s) => (
                <TouchableOpacity key={s} onPress={() => setSlot(s)} style={[...chip(slot === s), { flex: 1, alignItems: 'center' }]}>
                  <Text style={[styles.chipText, { color: slot === s ? '#FFFFFF' : colors.textSecondary }]}>
                    {s === 'morning' ? t('onboarding.morning', 'Morning') : t('onboarding.evening', 'Evening')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {t('dairy.starts_note', 'Deliveries start from the next day that is still open for changes.')}
            </Text>
          </Card>

          <Button title={t('dairy.add_save', 'Add household')} onPress={submit} loading={isLoading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  section: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  optionText: { flex: 1, fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 12 },
  error: { fontSize: 12, fontWeight: '600' },
});

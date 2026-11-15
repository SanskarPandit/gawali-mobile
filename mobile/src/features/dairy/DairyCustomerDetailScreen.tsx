import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { FileText, MapPin, MessageCircle, Pencil, Phone } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, BottomSheetModal, Button, Card, Header, Input, LoadState, QuantityStepper, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { errorMessage } from '../../shared/ui/QueryStates';
import {
  useGenerateBillMutation,
  useGetDairyCustomerQuery,
  useGetProductsQuery,
  useGetRoutesQuery,
  useRecordPaymentMutation,
  useStartCustomerPlanMutation,
  useUpdateCustomerPlanMutation,
  useUpdateDairyCustomerMutation,
} from '../../shared/api/gawaliApi';
import { DeliveryStatus, PlanStatus, toNumber } from '../../shared/api/types';
import { formatCurrency, formatQuantity } from '../../shared/utils/formatters';

const DELIVERY_BADGE: Record<DeliveryStatus, 'success' | 'info' | 'neutral' | 'error'> = {
  delivered: 'success',
  pending: 'info',
  skipped: 'neutral',
  missed: 'error',
};

export const DairyCustomerDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const customerId: string = route.params.customerId;

  const detail = useGetDairyCustomerQuery(customerId);
  const products = useGetProductsQuery();
  const routes = useGetRoutesQuery();
  const [startPlan, { isLoading: starting }] = useStartCustomerPlanMutation();
  const [updatePlan, { isLoading: updatingPlan }] = useUpdateCustomerPlanMutation();
  const [updateCustomer, { isLoading: savingCustomer }] = useUpdateDairyCustomerMutation();
  const [generateBill, { isLoading: generating }] = useGenerateBillMutation();
  const [recordPayment, { isLoading: recording }] = useRecordPaymentMutation();
  const refreshControl = usePullToRefresh(detail.refetch);

  const [planSheet, setPlanSheet] = useState(false);
  const [planProduct, setPlanProduct] = useState<string | null>(null);
  const [planQty, setPlanQty] = useState(1);
  const [detailsSheet, setDetailsSheet] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [stop, setStop] = useState(1);
  const [address, setAddress] = useState('');
  const [flat, setFlat] = useState('');
  const [instructions, setInstructions] = useState('');
  const [payBill, setPayBill] = useState<{ id: string; due: number; month: string } | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const d = detail.data;
  const c = d?.customer;
  const plan = d?.subscription;
  const milk = (products.data ?? []).filter((p) => p.kind === 'subscription' && p.is_available);

  useEffect(() => {
    if (c) {
      setRouteId(c.delivery_route);
      setStop(c.route_stop_order || 1);
      setAddress(c.address);
      setFlat(c.flat_or_house_number);
      setInstructions(c.delivery_instructions);
    }
  }, [c]);

  const fail = (e: unknown) => Alert.alert(t('dairy.not_updated', 'Not updated'), errorMessage(e));

  const openPlan = () => {
    setPlanProduct(plan?.product_id ?? milk[0]?.id ?? null);
    setPlanQty(plan ? toNumber(plan.default_quantity) : 1);
    setPlanSheet(true);
  };

  const savePlan = async () => {
    if (!planProduct) return;
    try {
      if (plan) {
        await updatePlan({ customerId, product_id: planProduct, default_quantity: planQty.toFixed(2) }).unwrap();
      } else {
        await startPlan({ customerId, product_id: planProduct, default_quantity: planQty.toFixed(2), delivery_time_slot: 'morning' }).unwrap();
      }
      setPlanSheet(false);
    } catch (e) {
      fail(e);
    }
  };

  const setPlanStatus = (status: PlanStatus) => {
    const copy = {
      paused: [t('dairy.pause_q', 'Pause deliveries?'), t('dairy.pause_b', 'No milk until you resume. Nothing is billed while paused.')],
      active: [t('dairy.resume_q', 'Resume deliveries?'), t('dairy.resume_b', 'Deliveries restart from the next open day.')],
      cancelled: [t('dairy.cancel_q', 'Cancel this plan?'), t('dairy.cancel_b', 'Deliveries stop permanently. You can start a new plan later.')],
    }[status];
    Alert.alert(copy[0], copy[1], [
      { text: t('common.no', 'No'), style: 'cancel' },
      {
        text: t('common.yes', 'Yes'),
        style: status === 'cancelled' ? 'destructive' : 'default',
        onPress: () => updatePlan({ customerId, status }).unwrap().catch(fail),
      },
    ]);
  };

  const saveDetails = async () => {
    try {
      await updateCustomer({
        id: customerId,
        delivery_route: routeId,
        route_stop_order: stop,
        address: address.trim(),
        flat_or_house_number: flat.trim(),
        delivery_instructions: instructions.trim(),
      }).unwrap();
      setDetailsSheet(false);
    } catch (e) {
      fail(e);
    }
  };

  const onGenerate = () =>
    Alert.alert(
      t('dairy.generate_q', 'Create this month’s bill?'),
      t('dairy.generate_b', 'Totals all delivered milk and extras so far this month. Running it again updates the same bill.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('dairy.generate', 'Create bill'),
          onPress: async () => {
            try {
              const res = await generateBill({ customerId }).unwrap();
              Alert.alert(res.message);
            } catch (e) {
              fail(e);
            }
          },
        },
      ]
    );

  const submitPayment = async (full: boolean) => {
    if (!payBill) return;
    const amount = toNumber(payAmount);
    if (!full && (amount <= 0 || amount > payBill.due)) {
      Alert.alert(t('dairy.bad_amount', 'Check the amount'), t('dairy.bad_amount_b', 'Enter an amount between ₹1 and {{due}}.', { due: formatCurrency(payBill.due) }));
      return;
    }
    try {
      const res = await recordPayment({ billId: payBill.id, customerId, mark_full: full, amount: full ? undefined : amount.toFixed(2) }).unwrap();
      setPayBill(null);
      Alert.alert(t('dairy.payment_recorded', 'Payment recorded'), res.message);
    } catch (e) {
      fail(e);
    }
  };

  const phone = c?.phone ?? '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={c?.full_name ?? ''} subtitle={c?.route_name ?? t('dairy.no_route', 'No route')} onBack={() => navigation.goBack()} />

      <LoadState isLoading={detail.isLoading} error={detail.error} hasData={!!d} onRetry={detail.refetch}>
        {d && c && (
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} refreshControl={refreshControl}>
            <StaleBanner error={detail.error} />

            <Card style={styles.section}>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                {[c.flat_or_house_number, c.address].filter(Boolean).join(', ')}
              </Text>
              {c.delivery_instructions ? <Text style={[styles.muted, { color: colors.textMuted }]}>“{c.delivery_instructions}”</Text> : null}
              <View style={styles.actions}>
                <Button title={t('customer_home.call', 'Call')} icon={<Phone size={14} color={colors.primary} />} variant="outline" size="sm" style={{ flex: 1 }} disabled={!phone} onPress={() => Linking.openURL(`tel:${phone}`)} />
                <Button title="WhatsApp" icon={<MessageCircle size={14} color={colors.primary} />} variant="outline" size="sm" style={{ flex: 1 }} disabled={!phone} onPress={() => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`)} />
                <Button title={t('dairy.edit', 'Edit')} icon={<Pencil size={14} color={colors.primary} />} variant="outline" size="sm" onPress={() => setDetailsSheet(true)} />
              </View>
            </Card>

            <View style={styles.metrics}>
              <Card style={styles.metric}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('dairy.outstanding', 'Outstanding')}</Text>
                <Text style={[styles.metricValue, { color: toNumber(d.metrics.outstanding) > 0 ? '#DC2626' : colors.primary }]}>{formatCurrency(d.metrics.outstanding)}</Text>
              </Card>
              <Card style={styles.metric}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('dairy.this_month', 'This month')}</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(d.metrics.this_month_amount)}</Text>
                <Text style={[styles.muted, { color: colors.textMuted }]}>{formatQuantity(d.metrics.this_month_delivered, plan?.unit ?? 'L')}</Text>
              </Card>
            </View>

            {/* Plan */}
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.plan', 'Daily plan')}</Text>
                {plan && <Badge label={plan.status === 'active' ? t('customer_calendar.active', 'Active') : t('customer_calendar.paused', 'Paused')} variant={plan.status === 'active' ? 'success' : 'neutral'} size="sm" />}
              </View>
              {plan ? (
                <>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>
                    {plan.product_name} · {formatQuantity(plan.default_quantity, plan.unit)} · {formatCurrency(plan.price_per_unit)}/{plan.unit}
                  </Text>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>
                    {t('dairy.since', 'Since {{date}}', { date: format(parseISO(plan.start_date), 'd MMM yyyy') })}
                  </Text>
                  <View style={styles.actions}>
                    <Button title={t('dairy.change', 'Change')} variant="outline" size="sm" style={{ flex: 1 }} onPress={openPlan} />
                    {plan.status === 'active' ? (
                      <Button title={t('customer_calendar.pause', 'Pause')} variant="outline" size="sm" style={{ flex: 1 }} onPress={() => setPlanStatus('paused')} loading={updatingPlan} />
                    ) : (
                      <Button title={t('customer_calendar.resume', 'Resume')} size="sm" style={{ flex: 1 }} onPress={() => setPlanStatus('active')} loading={updatingPlan} />
                    )}
                    <Button title={t('dairy.cancel_plan', 'Cancel')} variant="ghost" size="sm" onPress={() => setPlanStatus('cancelled')} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('dairy.no_plan_body', 'No milk is scheduled for this household.')}</Text>
                  <Button title={t('dairy.start_plan', 'Start a daily plan')} onPress={openPlan} />
                </>
              )}
            </Card>

            {/* Deliveries */}
            <Card style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.recent', 'Recent deliveries')}</Text>
              {d.recent_deliveries.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>{t('dairy.no_recent', 'No deliveries yet.')}</Text>
              ) : (
                d.recent_deliveries.map((r) => (
                  <View key={r.id} style={[styles.listRow, { borderColor: colors.border }]}>
                    <Text style={[styles.listText, { color: colors.textPrimary }]}>{format(parseISO(r.date), 'EEE, d MMM')}</Text>
                    <Text style={[styles.muted, { color: colors.textSecondary }]}>
                      {formatQuantity(r.status === 'delivered' ? r.delivered_quantity : r.scheduled_quantity, plan?.unit ?? 'L')}
                    </Text>
                    <Badge label={t(`common.${r.status}`, r.status.charAt(0).toUpperCase() + r.status.slice(1))} variant={DELIVERY_BADGE[r.status]} size="sm" />
                  </View>
                ))
              )}
            </Card>

            {/* Bills */}
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('bills.title', 'Bills')}</Text>
                <Button title={t('dairy.generate', 'Create bill')} icon={<FileText size={14} color={colors.primary} />} variant="outline" size="sm" onPress={onGenerate} loading={generating} />
              </View>
              {d.bills.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>{t('bills.empty', 'No bills yet')}</Text>
              ) : (
                d.bills.map((b) => {
                  const due = toNumber(b.due_amount);
                  return (
                    <View key={b.id} style={[styles.listRow, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.listText, { color: colors.textPrimary }]}>{b.month}</Text>
                        <Text style={[styles.muted, { color: colors.textSecondary }]}>
                          {formatCurrency(b.total_amount)} · {t('bills.paid_total', 'Paid')} {formatCurrency(b.paid_amount)}
                        </Text>
                      </View>
                      {due > 0 ? (
                        <TouchableOpacity
                          onPress={() => {
                            setPayAmount(due.toFixed(2));
                            setPayBill({ id: b.id, due, month: b.month });
                          }}
                          style={[styles.payBtn, { borderColor: '#DC2626' }]}
                        >
                          <Text style={styles.payText}>{formatCurrency(due)}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Badge label={t('bills.paid', 'Paid')} variant="success" size="sm" />
                      )}
                    </View>
                  );
                })
              )}
            </Card>
          </ScrollView>
        )}
      </LoadState>

      <BottomSheetModal
        visible={planSheet}
        onClose={() => setPlanSheet(false)}
        title={plan ? t('dairy.change_plan', 'Change plan') : t('dairy.start_plan', 'Start a daily plan')}
        subtitle={t('dairy.plan_note', 'Changes apply from the next open day')}
      >
        <View style={{ gap: 10 }}>
          {milk.map((p) => {
            const selected = planProduct === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPlanProduct(p.id)}
                style={[styles.option, { borderColor: selected ? colors.primary : colors.border }, selected && { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}
              >
                <Text style={[styles.listText, { color: colors.textPrimary, flex: 1 }]}>{p.name}</Text>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{formatCurrency(p.price_per_unit)}/{p.unit}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={{ alignItems: 'center' }}>
            <QuantityStepper value={planQty} onChange={setPlanQty} step={0.25} min={0.25} max={20} size="lg" />
          </View>
          <Button title={t('settings.save', 'Save changes')} onPress={savePlan} loading={starting || updatingPlan} disabled={!planProduct} />
        </View>
      </BottomSheetModal>

      <BottomSheetModal visible={detailsSheet} onClose={() => !savingCustomer && setDetailsSheet(false)} title={t('dairy.delivery_details', 'Delivery details')}>
        <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 10 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('dairy.route', 'Route')}</Text>
            <View style={styles.wrap}>
              {[{ id: null as string | null, name: t('dairy.no_route', 'No route') }, ...(routes.data ?? [])].map((r) => {
                const active = routeId === r.id;
                return (
                  <TouchableOpacity key={r.id ?? 'none'} onPress={() => setRouteId(r.id)} style={[styles.chip, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFFFFF' : colors.textSecondary }}>{r.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('dairy.stop', 'Stop number on the route')}</Text>
            <View style={{ alignItems: 'center' }}>
              <QuantityStepper value={stop} onChange={(v) => setStop(Math.max(1, Math.round(v)))} step={1} min={1} max={500} unit="" />
            </View>
            <Input label={t('profile.flat', 'Flat / house no.')} value={flat} onChangeText={setFlat} />
            <Input label={t('profile.street', 'Society, street, area')} value={address} onChangeText={setAddress} multiline />
            <Input label={t('profile.instructions', 'Instructions for your gawali')} value={instructions} onChangeText={setInstructions} multiline />
            <Button title={t('settings.save', 'Save changes')} icon={<MapPin size={14} color="#FFFFFF" />} onPress={saveDetails} loading={savingCustomer} disabled={!address.trim()} />
          </View>
        </ScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        visible={!!payBill}
        onClose={() => !recording && setPayBill(null)}
        title={t('dairy.record_payment', 'Record a payment')}
        subtitle={payBill ? `${payBill.month} · ${t('bills.due_amount', '{{amount}} due', { amount: formatCurrency(payBill.due) })}` : undefined}
      >
        <View style={{ gap: 12 }}>
          <Input label={t('dairy.amount_received', 'Amount received (₹)')} value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" />
          <Button title={t('dairy.record_amount', 'Record this amount')} onPress={() => submitPayment(false)} loading={recording} />
          <Button title={t('dairy.record_full', 'Mark fully paid')} variant="outline" onPress={() => submitPayment(true)} disabled={recording} />
        </View>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  section: { padding: 16, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  value: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  metrics: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, padding: 14 },
  metricLabel: { fontSize: 12, fontWeight: '600' },
  metricValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  listText: { fontSize: 14, fontWeight: '600', flex: 1 },
  payBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  payText: { color: '#DC2626', fontWeight: '800', fontSize: 13 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
});

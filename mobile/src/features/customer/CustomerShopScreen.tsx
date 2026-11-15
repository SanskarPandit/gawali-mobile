import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { PackageOpen, ShoppingBag, X } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, BottomSheetModal, Button, Card, EmptyState, Header, LoadState, QuantityStepper, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { errorMessage } from '../../shared/ui/QueryStates';
import {
  useCancelOrderMutation,
  useCreateOrderMutation,
  useGetCustomerDashboardQuery,
  useGetMyOrdersQuery,
  useGetShopProductsQuery,
} from '../../shared/api/gawaliApi';
import { Order, Product, toNumber } from '../../shared/api/types';
import { formatCurrency } from '../../shared/utils/formatters';

export const CustomerShopScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const products = useGetShopProductsQuery();
  const orders = useGetMyOrdersQuery({ upcoming: true });
  const dashboard = useGetCustomerDashboardQuery();
  const [createOrder, { isLoading: ordering }] = useCreateOrderMutation();
  const [cancelOrder] = useCancelOrderMutation();
  const refreshControl = usePullToRefresh(async () => {
    await Promise.all([products.refetch(), orders.refetch()]);
  });

  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState<string | null>(null);

  const extras = (products.data ?? []).filter((p) => p.kind === 'one_time');
  const upcoming = (orders.data ?? []).filter((o) => o.status === 'pending');
  const earliest = dashboard.data?.earliest_changeable_date;

  const dates = useMemo(() => {
    if (!earliest) return [];
    return Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(earliest), i), 'yyyy-MM-dd'));
  }, [earliest]);

  const openProduct = (p: Product) => {
    setSelected(p);
    setQty(1);
    setDate(dates[0] ?? null);
  };

  const placeOrder = async () => {
    if (!selected || !date) return;
    try {
      await createOrder({ product: selected.id, quantity: qty.toFixed(2), delivery_date: date }).unwrap();
      setSelected(null);
      Alert.alert(
        t('shop.ordered', 'Order placed'),
        t('shop.ordered_body', '{{name}} will come with your milk on {{date}}. It is added to your monthly bill.', {
          name: selected.name,
          date: format(parseISO(date), 'EEEE, d MMM'),
        })
      );
    } catch (e) {
      Alert.alert(t('shop.not_ordered', 'Order not placed'), errorMessage(e));
    }
  };

  const confirmCancel = (o: Order) =>
    Alert.alert(t('shop.cancel_title', 'Cancel this order?'), `${o.product_name} · ${format(parseISO(o.delivery_date), 'd MMM')}`, [
      { text: t('common.no', 'No'), style: 'cancel' },
      {
        text: t('shop.cancel', 'Cancel order'),
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelOrder(o.id).unwrap();
          } catch (e) {
            Alert.alert(t('shop.not_cancelled', 'Could not cancel'), errorMessage(e));
          }
        },
      },
    ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={t('shop.title', 'Dairy store')} subtitle={t('shop.subtitle', 'Extras delivered with your milk')} />

      <LoadState isLoading={products.isLoading} error={products.error} hasData={!!products.data} onRetry={products.refetch}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} refreshControl={refreshControl}>
          <StaleBanner error={products.error} />

          {upcoming.length > 0 && (
            <Card style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('shop.upcoming', 'Your upcoming extras')}</Text>
              {upcoming.map((o) => (
                <View key={o.id} style={[styles.orderRow, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orderName, { color: colors.textPrimary }]}>
                      {o.product_name} × {toNumber(o.quantity)}
                    </Text>
                    <Text style={[styles.muted, { color: colors.textSecondary }]}>
                      {format(parseISO(o.delivery_date), 'EEE, d MMM')} · {formatCurrency(o.total_price)}
                    </Text>
                  </View>
                  {earliest && o.delivery_date >= earliest ? (
                    <TouchableOpacity onPress={() => confirmCancel(o)} hitSlop={8} accessibilityLabel={t('shop.cancel', 'Cancel order')}>
                      <X size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <Badge label={t('shop.confirmed', 'Confirmed')} variant="emerald" size="sm" />
                  )}
                </View>
              ))}
            </Card>
          )}

          {extras.length === 0 ? (
            <EmptyState
              icon={<PackageOpen size={36} color={colors.textMuted} />}
              title={t('shop.empty', 'Nothing in the store yet')}
              body={t('shop.empty_body', 'Your dairy has not added extra items like curd or paneer.')}
            />
          ) : (
            <View style={styles.grid}>
              {extras.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.8}
                  onPress={() => p.is_available && openProduct(p)}
                  style={[styles.product, { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.border, opacity: p.is_available ? 1 : 0.5 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${formatCurrency(p.price_per_unit)} per ${p.unit}`}
                >
                  <View style={[styles.productIcon, { backgroundColor: isDark ? colors.background : '#ECFDF5' }]}>
                    <ShoppingBag size={22} color={colors.primary} />
                  </View>
                  <Text style={[styles.productName, { color: colors.textPrimary }]} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>{p.unit}</Text>
                  <Text style={[styles.price, { color: colors.primary }]}>{formatCurrency(p.price_per_unit)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </LoadState>

      <BottomSheetModal
        visible={!!selected}
        onClose={() => !ordering && setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected ? `${formatCurrency(selected.price_per_unit)} / ${selected.unit}` : undefined}
      >
        <View style={{ gap: 14 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('shop.quantity', 'Quantity')}</Text>
          <View style={{ alignItems: 'center' }}>
            <QuantityStepper value={qty} onChange={setQty} step={1} min={1} max={20} unit="" size="lg" />
          </View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('shop.when', 'Deliver on')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {dates.map((d) => {
              const active = date === d;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDate(d)}
                  style={[styles.dateChip, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}
                >
                  <Text style={{ fontSize: 11, color: active ? '#FFFFFF' : colors.textSecondary }}>{format(parseISO(d), 'EEE')}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: active ? '#FFFFFF' : colors.textPrimary }}>{format(parseISO(d), 'd MMM')}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Button
            title={t('shop.place', 'Order for {{amount}}', { amount: formatCurrency(qty * toNumber(selected?.price_per_unit)) })}
            onPress={placeOrder}
            loading={ordering}
            disabled={!date}
          />
          <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>
            {t('shop.billing_note', 'Pay with your monthly bill. No payment now.')}
          </Text>
        </View>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  section: { padding: 16, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  orderName: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  product: { width: '48%', padding: 14, borderRadius: 16, borderWidth: 1, gap: 4 },
  productIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  productName: { fontSize: 14, fontWeight: '700' },
  price: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  dateChip: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
});

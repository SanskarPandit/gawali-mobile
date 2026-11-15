import React, { useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { Check, ClipboardList, Package, RotateCcw, X } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, Card, EmptyState, Header, LoadState, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { errorMessage } from '../../shared/ui/QueryStates';
import {
  useGetDairyOrdersQuery,
  useGetManifestQuery,
  useGetRoutesQuery,
  useSetDeliveryStatusMutation,
  useSetOrderStatusMutation,
} from '../../shared/api/gawaliApi';
import { Delivery, DeliveryStatus, toNumber } from '../../shared/api/types';
import { formatLitres, formatQuantity } from '../../shared/utils/formatters';

type StatusFilter = 'all' | DeliveryStatus;

const BADGE: Record<DeliveryStatus, 'success' | 'info' | 'neutral' | 'error'> = {
  delivered: 'success',
  pending: 'info',
  skipped: 'neutral',
  missed: 'error',
};

export const DairyDeliveriesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [routeId, setRouteId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const date = format(day === 'today' ? new Date() : addDays(new Date(), 1), 'yyyy-MM-dd');

  const manifest = useGetManifestQuery({ date, route_id: routeId });
  const routes = useGetRoutesQuery();
  const orders = useGetDairyOrdersQuery({ date });
  const [setStatus, { isLoading: updating, originalArgs }] = useSetDeliveryStatusMutation();
  const [setOrderStatus] = useSetOrderStatusMutation();
  const refreshControl = usePullToRefresh(async () => {
    await Promise.all([manifest.refetch(), orders.refetch()]);
  });

  const rows = useMemo(
    () => (manifest.data?.deliveries ?? []).filter((d) => statusFilter === 'all' || d.status === statusFilter),
    [manifest.data, statusFilter]
  );
  const s = manifest.data?.summary;
  const dayOrders = (orders.data ?? []).filter((o) => o.status !== 'cancelled');
  const isToday = day === 'today';

  const label = (st: DeliveryStatus) =>
    ({
      delivered: t('common.delivered', 'Delivered'),
      pending: t('common.pending', 'Pending'),
      skipped: t('common.skipped', 'Skipped'),
      missed: t('common.missed', 'Missed'),
    })[st];

  const update = async (d: Delivery, status: DeliveryStatus) => {
    try {
      const res = await setStatus({ id: d.id, status }).unwrap();
      if (!res.applied) {
        Alert.alert(t('dairy.newer_change', 'Already updated'), t('dairy.newer_change_body', 'A newer change was made by your gawali. The list has been refreshed.'));
      }
    } catch (e) {
      Alert.alert(t('dairy.not_updated', 'Not updated'), errorMessage(e));
    }
  };

  const markMissed = (d: Delivery) =>
    Alert.alert(t('dairy.mark_missed', 'Mark as missed?'), t('dairy.mark_missed_body', '{{name}} will not be billed for today.', { name: d.customer_name }), [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      { text: t('dairy.missed', 'Missed'), style: 'destructive', onPress: () => update(d, 'missed') },
    ]);

  const Chip = ({ active, text, onPress }: { active: boolean; text: string; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.primary : isDark ? colors.surface : 'rgba(0,0,0,0.05)' }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={t('dairy.deliveries', 'Deliveries')} subtitle={format(parseISO(date), 'EEEE, d MMMM')} />

      <View style={styles.filters}>
        <View style={[styles.segment, { backgroundColor: isDark ? colors.surface : 'rgba(0,0,0,0.05)' }]}>
          {(['today', 'tomorrow'] as const).map((k) => (
            <TouchableOpacity key={k} onPress={() => setDay(k)} style={[styles.segmentItem, day === k && { backgroundColor: colors.primary }]}>
              <Text style={[styles.segmentText, { color: day === k ? '#FFFFFF' : colors.textSecondary }]}>
                {k === 'today' ? t('common.today', 'Today') : t('common.tomorrow', 'Tomorrow')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip active={!routeId} text={t('dairy.all_routes', 'All routes')} onPress={() => setRouteId(undefined)} />
          {(routes.data ?? []).map((r) => (
            <Chip key={r.id} active={routeId === r.id} text={r.name} onPress={() => setRouteId(r.id)} />
          ))}
        </ScrollView>
        {isToday && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(['all', 'pending', 'delivered', 'skipped', 'missed'] as const).map((k) => (
              <Chip
                key={k}
                active={statusFilter === k}
                text={`${k === 'all' ? t('dairy.all', 'All') : label(k)}${s ? ` (${k === 'all' ? s.total : s[k]})` : ''}`}
                onPress={() => setStatusFilter(k)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <LoadState isLoading={manifest.isLoading} error={manifest.error} hasData={!!manifest.data} onRetry={manifest.refetch}>
        <FlatList<Delivery>
          data={rows}
          keyExtractor={(d: Delivery) => d.id.toString()}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={refreshControl}
          ListHeaderComponent={
            <>
              <StaleBanner error={manifest.error} />

              {s && (
                <Card style={styles.summary}>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatLitres(isToday ? s.delivered_litres : s.scheduled_litres)}</Text>
                    <Text style={[styles.muted, { color: colors.textMuted }]}>
                      {isToday ? t('dairy.delivered_of', 'delivered of {{qty}}', { qty: formatLitres(s.scheduled_litres) }) : t('dairy.to_prepare', 'to prepare')}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{s.total - s.skipped}</Text>
                    <Text style={[styles.muted, { color: colors.textMuted }]}>{t('dairy.stops', 'stops')}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{s.skipped}</Text>
                    <Text style={[styles.muted, { color: colors.textMuted }]}>{t('common.skipped', 'Skipped')}</Text>
                  </View>
                </Card>
              )}

              {dayOrders.length > 0 && (
                <Card style={styles.section}>
                  <View style={styles.titleRow}>
                    <Package size={16} color={colors.primary} />
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.extras', 'Extra items to deliver')}</Text>
                  </View>
                  {dayOrders.map((o) => (
                    <View key={o.id} style={[styles.orderRow, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, { color: colors.textPrimary }]}>
                          {o.product_name} × {toNumber(o.quantity)}
                        </Text>
                        <Text style={[styles.muted, { color: colors.textSecondary }]}>{o.customer_name}</Text>
                      </View>
                      {o.status === 'delivered' ? (
                        <Badge label={t('common.delivered', 'Delivered')} variant="success" size="sm" />
                      ) : isToday ? (
                        <View style={styles.actions}>
                          <TouchableOpacity onPress={() => setOrderStatus({ id: o.id, status: 'cancelled' }).unwrap().catch((e) => Alert.alert(errorMessage(e)))} style={[styles.actionBtn, { borderColor: colors.border }]} accessibilityLabel={t('shop.cancel', 'Cancel order')}>
                            <X size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setOrderStatus({ id: o.id, status: 'delivered' }).unwrap().catch((e) => Alert.alert(errorMessage(e)))} style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} accessibilityLabel={t('common.delivered', 'Delivered')}>
                            <Check size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Badge label={t('common.scheduled', 'Scheduled')} variant="info" size="sm" />
                      )}
                    </View>
                  ))}
                </Card>
              )}
            </>
          }
          ListEmptyComponent={
            <EmptyState
              icon={<ClipboardList size={36} color={colors.textMuted} />}
              title={t('dairy.no_deliveries', 'No deliveries here')}
              body={t('dairy.no_deliveries_body', 'Households with an active plan appear here automatically.')}
            />
          }
          renderItem={({ item: d }: { item: Delivery }) => {
            const busy = updating && originalArgs?.id === d.id;
            return (
              <Card style={styles.stop} onPress={() => navigation.navigate('DairyCustomerDetail', { customerId: d.customer_id })}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.textPrimary }]}>
                      {d.stop_order ? `${d.stop_order}. ` : ''}
                      {d.customer_name}
                    </Text>
                    <Text style={[styles.muted, { color: colors.textSecondary }]} numberOfLines={1}>
                      {[d.flat_or_house, d.customer_address].filter(Boolean).join(', ')}
                    </Text>
                    <Text style={[styles.muted, { color: colors.textMuted }]}>
                      {d.product_name} · {formatQuantity(d.status === 'delivered' ? d.delivered_quantity : d.scheduled_quantity, d.product_unit)}
                      {d.route_name ? ` · ${d.route_name}` : ''}
                    </Text>
                  </View>
                  <Badge label={label(d.status)} variant={BADGE[d.status]} size="sm" />
                </View>
                {isToday && d.status !== 'skipped' && (
                  <View style={styles.actions}>
                    {d.status === 'pending' ? (
                      <>
                        <TouchableOpacity disabled={busy} onPress={() => markMissed(d)} style={[styles.actionWide, { borderColor: colors.border }]}>
                          <X size={15} color="#DC2626" />
                          <Text style={[styles.actionText, { color: '#DC2626' }]}>{t('dairy.missed', 'Missed')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={busy} onPress={() => update(d, 'delivered')} style={[styles.actionWide, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                          <Check size={15} color="#FFFFFF" />
                          <Text style={[styles.actionText, { color: '#FFFFFF' }]}>{t('common.delivered', 'Delivered')}</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity disabled={busy} onPress={() => update(d, 'pending')} style={[styles.actionWide, { borderColor: colors.border }]}>
                        <RotateCcw size={15} color={colors.textSecondary} />
                        <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('dairy.undo', 'Undo')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </Card>
            );
          }}
        />
      </LoadState>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  filters: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segmentText: { fontSize: 13, fontWeight: '700' },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipText: { fontSize: 12, fontWeight: '600' },
  scroll: { padding: 16, gap: 12 },
  summary: { flexDirection: 'row', padding: 14 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  section: { padding: 16, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  stop: { padding: 14, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionWide: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  actionText: { fontSize: 13, fontWeight: '700' },
});

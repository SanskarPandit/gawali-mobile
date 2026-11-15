import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, FlatList, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Check, CloudOff, CloudUpload, MapPin, Navigation, Phone, RotateCcw, UserX, X } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { BottomSheetModal, Button, Card, EmptyState, Header, LoadState, QuantityStepper, usePullToRefresh } from '../../shared/ui';
import { SettingsHeaderButton } from '../settings/SettingsHeaderButton';
import { useAppDispatch, useAppSelector } from '../../app/store';
import {
  dismissRejected,
  flushDeliveryQueue,
  hydrateDeliveryQueue,
  recordDeliveryChange,
  withPendingChanges,
} from '../../app/store/deliverySyncSlice';
import { useGetGawaliRouteQuery } from '../../shared/api/gawaliApi';
import { Delivery, DeliveryStatus, GawaliRoute, toNumber } from '../../shared/api/types';
import { formatQuantity } from '../../shared/utils/formatters';

const SYNC_INTERVAL_MS = 20000;

export const DeliveryRouteScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { user, sessionMode } = useAppSelector((s) => s.auth);
  const sync = useAppSelector((s) => s.deliverySync);

  const route = useGetGawaliRouteQuery();
  const [cached, setCached] = useState<GawaliRoute | null>(null);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [qtyStop, setQtyStop] = useState<(Delivery & { pending: boolean }) | null>(null);
  const [qty, setQty] = useState(1);
  const cacheKey = user ? `gawali:route:${user.id}` : null;
  const persistOffline = sessionMode === 'live' && !!cacheKey;

  // Restore unsynced changes and the last route on this phone, then try to upload.
  useEffect(() => {
    dispatch(hydrateDeliveryQueue()).then(() => dispatch(flushDeliveryQueue()));
    if (persistOffline) {
      AsyncStorage.getItem(cacheKey!)
        .then((raw) => raw && setCached(JSON.parse(raw)))
        .catch(() => undefined);
    }
  }, [dispatch, persistOffline, cacheKey]);

  // Keep the last good route so the list still opens without signal.
  useEffect(() => {
    if (route.data && persistOffline) {
      AsyncStorage.setItem(cacheKey!, JSON.stringify(route.data)).catch(() => undefined);
    }
  }, [route.data, persistOffline, cacheKey]);

  // Retry uploads while there is anything waiting, and whenever the app comes back.
  useEffect(() => {
    const id = setInterval(() => dispatch(flushDeliveryQueue()), SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && dispatch(flushDeliveryQueue()));
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [dispatch]);

  const refresh = useCallback(async () => {
    await dispatch(flushDeliveryQueue());
    await route.refetch();
  }, [dispatch, route]);
  const refreshControl = usePullToRefresh(refresh);

  const today = format(new Date(), 'yyyy-MM-dd');
  const source = route.data ?? (cached?.date === today ? cached : null);
  const stops = useMemo(() => withPendingChanges(source?.stops ?? [], sync.queue), [source, sync.queue]);
  const active = stops.filter((s) => s.status !== 'skipped');
  const todo = active.filter((s) => s.status === 'pending');
  const done = active.filter((s) => s.status !== 'pending');
  const deliveredLitres = done.filter((s) => s.status === 'delivered').reduce((sum, s) => sum + toNumber(s.delivered_quantity), 0);
  const shown = tab === 'todo' ? todo : done;

  const mark = (stop: Delivery, status: DeliveryStatus, quantity?: number) =>
    dispatch(recordDeliveryChange({ id: stop.id, status, delivered_quantity: quantity !== undefined ? quantity.toFixed(2) : null }));

  const notHome = (stop: Delivery) =>
    Alert.alert(t('gawali.not_home', 'Mark as not delivered?'), t('gawali.not_home_body', '{{name}} will not be charged for today.', { name: stop.customer_name }), [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      { text: t('gawali.not_delivered', 'Not delivered'), style: 'destructive', onPress: () => mark(stop, 'missed') },
    ]);

  const navigate = (stop: Delivery) => {
    const q = stop.latitude && stop.longitude ? `${stop.latitude},${stop.longitude}` : encodeURIComponent(`${stop.flat_or_house} ${stop.customer_address}`);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => undefined);
  };

  const pendingCount = sync.queue.length;
  const syncBar = pendingCount
    ? sync.offline
      ? { icon: <CloudOff size={14} color="#92400E" />, bg: '#FEF3C7', fg: '#92400E', text: t('gawali.offline', '{{count}} saved on phone · will sync when online', { count: pendingCount }) }
      : { icon: <CloudUpload size={14} color={colors.primary} />, bg: isDark ? colors.surface : '#ECFDF5', fg: colors.primary, text: t('gawali.syncing', 'Syncing {{count}} change(s)…', { count: pendingCount }) }
    : sync.lastSyncedAt
      ? { icon: <Check size={14} color={colors.primary} />, bg: isDark ? colors.surface : '#ECFDF5', fg: colors.primary, text: t('gawali.synced', 'All changes synced') }
      : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={source?.route_name ?? t('gawali.title', "Today's route")}
        subtitle={source ? `${source.dairy_name} · ${format(parseISO(source.date), 'EEE d MMM')}` : undefined}
        rightAction={<SettingsHeaderButton onPress={() => navigation.navigate('DeliverySettings')} />}
      />

      <LoadState isLoading={route.isLoading && !source} error={route.error} hasData={!!source} onRetry={route.refetch}>
        <View style={[styles.summary, { borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {done.length}/{active.length}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>{t('gawali.stops_done', 'stops done')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatQuantity(deliveredLitres, 'L')}</Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>{t('gawali.delivered', 'delivered')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{todo.length}</Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>{t('gawali.left', 'left')}</Text>
          </View>
        </View>

        {syncBar && (
          <View style={[styles.syncBar, { backgroundColor: syncBar.bg }]}>
            {syncBar.icon}
            <Text style={[styles.syncText, { color: syncBar.fg }]}>{syncBar.text}</Text>
          </View>
        )}
        {!route.data && cached && (
          <View style={[styles.syncBar, { backgroundColor: '#FEF3C7' }]}>
            <CloudOff size={14} color="#92400E" />
            <Text style={[styles.syncText, { color: '#92400E' }]}>{t('gawali.cached', 'Offline: showing the route saved on this phone')}</Text>
          </View>
        )}
        {sync.rejected.length > 0 && (
          <View style={[styles.rejected, { borderColor: '#FCA5A5' }]}>
            <AlertTriangle size={16} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectedTitle}>{t('gawali.rejected', '{{count}} change(s) were not accepted', { count: sync.rejected.length })}</Text>
              {sync.rejected.slice(0, 3).map((r) => (
                <Text key={r.id} style={styles.rejectedText}>
                  {(stops.find((s) => s.id === r.id)?.customer_name ?? '') + ': ' + r.detail}
                </Text>
              ))}
            </View>
            <TouchableOpacity onPress={() => dispatch(dismissRejected())} hitSlop={8} accessibilityLabel={t('common.dismiss', 'Dismiss')}>
              <X size={16} color="#DC2626" />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.segment, { backgroundColor: isDark ? colors.surface : 'rgba(0,0,0,0.05)' }]}>
          {(['todo', 'done'] as const).map((k) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[styles.segmentItem, tab === k && { backgroundColor: colors.primary }]}>
              <Text style={[styles.segmentText, { color: tab === k ? '#FFFFFF' : colors.textSecondary }]}>
                {k === 'todo' ? `${t('gawali.to_deliver', 'To deliver')} (${todo.length})` : `${t('gawali.done', 'Done')} (${done.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={shown}
          keyExtractor={(s) => s.id.toString()}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={refreshControl}
          ListEmptyComponent={
            <EmptyState
              icon={<Check size={36} color={colors.primary} />}
              title={tab === 'todo' ? t('gawali.all_done', 'All stops done') : t('gawali.none_done', 'Nothing delivered yet')}
              body={tab === 'todo' && active.length ? t('gawali.all_done_body', 'Great work. Pull down to check for changes.') : undefined}
            />
          }
          renderItem={({ item: s }) => (
            <Card style={[styles.stop, s.pending && { borderColor: '#F59E0B', borderWidth: 1 }]}>
              <View style={styles.stopHead}>
                <View style={[styles.stopNum, { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}>
                  <Text style={[styles.stopNumText, { color: colors.primary }]}>{s.stop_order || '•'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{s.customer_name}</Text>
                  <Text style={[styles.address, { color: colors.textSecondary }]}>
                    {[s.flat_or_house, s.customer_address].filter(Boolean).join(', ')}
                  </Text>
                  {s.landmark ? <Text style={[styles.muted, { color: colors.textMuted }]}>{t('gawali.near', 'Near')} {s.landmark}</Text> : null}
                </View>
                <Text style={[styles.qty, { color: colors.primary }]}>
                  {formatQuantity(s.status === 'delivered' ? s.delivered_quantity : s.scheduled_quantity, s.product_unit)}
                </Text>
              </View>
              {s.delivery_instructions ? (
                <Text style={[styles.instructions, { color: colors.textSecondary, backgroundColor: isDark ? colors.surface : '#F8FAFC' }]}>“{s.delivery_instructions}”</Text>
              ) : null}

              {s.status === 'pending' ? (
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => navigate(s)} style={[styles.iconBtn, { borderColor: colors.border }]} accessibilityLabel={t('gawali.navigate', 'Navigate')}>
                    <Navigation size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {s.customer_phone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${s.customer_phone}`)} style={[styles.iconBtn, { borderColor: colors.border }]} accessibilityLabel={t('customer_home.call', 'Call')}>
                      <Phone size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => notHome(s)} style={[styles.iconBtn, { borderColor: colors.border }]} accessibilityLabel={t('gawali.not_delivered', 'Not delivered')}>
                    <UserX size={18} color="#DC2626" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => mark(s, 'delivered')}
                    onLongPress={() => {
                      setQty(toNumber(s.scheduled_quantity));
                      setQtyStop(s);
                    }}
                    style={[styles.deliverBtn, { backgroundColor: colors.primary }]}
                    accessibilityRole="button"
                    accessibilityHint={t('gawali.long_press', 'Long press to change the quantity')}
                  >
                    <Check size={18} color="#FFFFFF" />
                    <Text style={styles.deliverText}>{t('common.delivered', 'Delivered')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.doneRow}>
                  <View style={styles.doneLabel}>
                    {s.status === 'delivered' ? <Check size={16} color={colors.primary} /> : <UserX size={16} color="#DC2626" />}
                    <Text style={{ fontWeight: '700', color: s.status === 'delivered' ? colors.primary : '#DC2626' }}>
                      {s.status === 'delivered' ? t('common.delivered', 'Delivered') : t('gawali.not_delivered', 'Not delivered')}
                    </Text>
                    {s.pending && <Text style={[styles.muted, { color: '#B45309' }]}>· {t('gawali.not_synced', 'not synced yet')}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => mark(s, 'pending')} style={styles.undo} accessibilityLabel={t('dairy.undo', 'Undo')}>
                    <RotateCcw size={14} color={colors.textSecondary} />
                    <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('dairy.undo', 'Undo')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          )}
          ListFooterComponent={
            active.length > 0 && tab === 'todo' ? (
              <View style={styles.hint}>
                <MapPin size={12} color={colors.textMuted} />
                <Text style={[styles.muted, { color: colors.textMuted }]}>{t('gawali.long_press', 'Long press Delivered to change the quantity')}</Text>
              </View>
            ) : undefined
          }
        />
      </LoadState>

      <BottomSheetModal visible={!!qtyStop} onClose={() => setQtyStop(null)} title={qtyStop?.customer_name ?? ''} subtitle={t('gawali.qty_given', 'Quantity actually given')}>
        <View style={{ gap: 14 }}>
          <View style={{ alignItems: 'center' }}>
            <QuantityStepper value={qty} onChange={setQty} step={0.25} min={0.25} max={20} unit={qtyStop?.product_unit ?? 'L'} size="lg" />
          </View>
          <Button
            title={t('gawali.confirm_qty', 'Delivered {{qty}}', { qty: formatQuantity(qty, qtyStop?.product_unit ?? 'L') })}
            onPress={() => {
              if (qtyStop) mark(qtyStop, 'delivered', qty);
              setQtyStop(null);
            }}
          />
        </View>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  muted: { fontSize: 12 },
  syncBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  syncText: { flex: 1, fontSize: 12, fontWeight: '600' },
  rejected: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: '#FEF2F2' },
  rejectedTitle: { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
  rejectedText: { fontSize: 12, color: '#B91C1C', marginTop: 2 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4, marginHorizontal: 16, marginTop: 12 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segmentText: { fontSize: 13, fontWeight: '700' },
  scroll: { padding: 16, gap: 12 },
  stop: { padding: 14, gap: 10 },
  stopHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stopNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stopNumText: { fontWeight: '800', fontSize: 14 },
  name: { fontSize: 16, fontWeight: '700' },
  address: { fontSize: 13, marginTop: 2 },
  qty: { fontSize: 16, fontWeight: '800' },
  instructions: { fontSize: 12, fontStyle: 'italic', padding: 8, borderRadius: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deliverBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, height: 46 },
  deliverText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doneLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
});

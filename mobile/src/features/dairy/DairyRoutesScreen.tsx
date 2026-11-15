import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Info, ListOrdered, Pencil, Plus, Route as RouteIcon, Trash2, Truck } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, BottomSheetModal, Button, Card, EmptyState, Header, Input, LoadState, usePullToRefresh } from '../../shared/ui';
import { errorMessage, fieldErrorsOf } from '../../shared/ui/QueryStates';
import {
  useCreateRouteMutation,
  useDeleteRouteMutation,
  useGetDairyCustomersQuery,
  useGetGawalisQuery,
  useGetRoutesQuery,
  useReorderRouteMutation,
  useUpdateGawaliMutation,
  useUpdateRouteMutation,
} from '../../shared/api/gawaliApi';
import type { DairyCustomer, Gawali, Route } from '../../shared/api/types';

export const DairyRoutesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const routes = useGetRoutesQuery();
  const gawalis = useGetGawalisQuery();
  const customers = useGetDairyCustomersQuery();
  const [createRoute, createState] = useCreateRouteMutation();
  const [updateRoute, updateState] = useUpdateRouteMutation();
  const [deleteRoute] = useDeleteRouteMutation();
  const [reorder, { isLoading: reordering }] = useReorderRouteMutation();
  const [updateGawali, { isLoading: savingGawali }] = useUpdateGawaliMutation();
  const refreshControl = usePullToRefresh(async () => {
    await Promise.all([routes.refetch(), gawalis.refetch(), customers.refetch()]);
  });

  const [routeSheet, setRouteSheet] = useState<{ route: Route | null } | null>(null);
  const [routeName, setRouteName] = useState('');
  const [routeDesc, setRouteDesc] = useState('');
  const [orderRoute, setOrderRoute] = useState<Route | null>(null);
  const [order, setOrder] = useState<DairyCustomer[]>([]);
  const [gawaliSheet, setGawaliSheet] = useState<Gawali | null>(null);
  const [gawaliRoute, setGawaliRoute] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState('');

  const byRoute = useMemo(() => {
    const map = new Map<string, DairyCustomer[]>();
    for (const c of customers.data ?? []) {
      const key = c.delivery_route ?? 'none';
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    for (const list of map.values()) list.sort((a, b) => a.route_stop_order - b.route_stop_order);
    return map;
  }, [customers.data]);

  const routeError = fieldErrorsOf(routeSheet?.route ? updateState.error : createState.error).name;

  const openRoute = (route: Route | null) => {
    createState.reset();
    updateState.reset();
    setRouteName(route?.name ?? '');
    setRouteDesc(route?.description ?? '');
    setRouteSheet({ route });
  };

  const saveRoute = async () => {
    try {
      if (routeSheet?.route) await updateRoute({ id: routeSheet.route.id, name: routeName.trim(), description: routeDesc.trim() }).unwrap();
      else await createRoute({ name: routeName.trim(), description: routeDesc.trim() }).unwrap();
      setRouteSheet(null);
    } catch (e) {
      if (!fieldErrorsOf(e).name) Alert.alert(t('dairy.not_updated', 'Not updated'), errorMessage(e));
    }
  };

  const removeRoute = (route: Route) =>
    Alert.alert(
      t('dairy.delete_route', 'Delete {{name}}?', { name: route.name }),
      t('dairy.delete_route_body', 'Its households and gawalis move to “No route”. Nobody loses their plan.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('admin_dashboard.delete_btn', 'Delete'), style: 'destructive', onPress: () => deleteRoute(route.id).unwrap().catch((e) => Alert.alert(errorMessage(e))) },
      ]
    );

  const openOrder = (route: Route) => {
    setOrder(byRoute.get(route.id) ?? []);
    setOrderRoute(route);
  };

  const move = (i: number, dir: -1 | 1) =>
    setOrder((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const saveOrder = async () => {
    if (!orderRoute) return;
    try {
      await reorder({ route_id: orderRoute.id, customer_ids: order.map((c) => c.id) }).unwrap();
      setOrderRoute(null);
    } catch (e) {
      Alert.alert(t('dairy.not_updated', 'Not updated'), errorMessage(e));
    }
  };

  const openGawali = (g: Gawali) => {
    setGawaliRoute(g.assigned_route);
    setVehicle(g.vehicle_number);
    setGawaliSheet(g);
  };

  const saveGawali = async () => {
    if (!gawaliSheet) return;
    try {
      await updateGawali({ id: gawaliSheet.id, assigned_route: gawaliRoute, vehicle_number: vehicle.trim() }).unwrap();
      setGawaliSheet(null);
    } catch (e) {
      Alert.alert(t('dairy.not_updated', 'Not updated'), errorMessage(e));
    }
  };

  const chip = (active: boolean) => [styles.chip, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('dairy.routes', 'Routes & gawalis')}
        onBack={() => navigation.goBack()}
        rightAction={<Button title={t('dairy.new_route', 'Route')} icon={<Plus size={14} color="#FFFFFF" />} size="sm" onPress={() => openRoute(null)} />}
      />
      <LoadState isLoading={routes.isLoading} error={routes.error} hasData={!!routes.data} onRetry={routes.refetch}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} refreshControl={refreshControl}>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>{t('dairy.routes_heading', 'Routes')}</Text>
          {(routes.data ?? []).length === 0 ? (
            <EmptyState
              icon={<RouteIcon size={32} color={colors.textMuted} />}
              title={t('dairy.no_routes', 'No routes yet')}
              body={t('dairy.no_routes_body', 'Group nearby households into a route so each gawali gets an ordered list of stops.')}
            />
          ) : (
            routes.data!.map((r) => {
              const members = byRoute.get(r.id) ?? [];
              const runners = (gawalis.data ?? []).filter((g) => g.assigned_route === r.id);
              return (
                <Card key={r.id} style={styles.section}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.textPrimary }]}>{r.name}</Text>
                      {r.description ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{r.description}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={() => openRoute(r)} style={styles.iconBtn} accessibilityLabel={t('dairy.edit', 'Edit')}>
                      <Pencil size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeRoute(r)} style={styles.iconBtn} accessibilityLabel={t('admin_dashboard.delete_btn', 'Delete')}>
                      <Trash2 size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>
                    {t('dairy.route_stats', '{{count}} households', { count: members.length })} ·{' '}
                    {runners.length ? runners.map((g) => g.full_name).join(', ') : t('dairy.no_gawali', 'No gawali assigned')}
                  </Text>
                  <Button
                    title={t('dairy.stop_order', 'Set stop order')}
                    icon={<ListOrdered size={14} color={colors.primary} />}
                    variant="outline"
                    size="sm"
                    disabled={members.length < 2}
                    onPress={() => openOrder(r)}
                  />
                </Card>
              );
            })
          )}

          <Text style={[styles.heading, { color: colors.textPrimary }]}>{t('dairy.gawalis', 'Gawalis')}</Text>
          <View style={[styles.note, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}>
            <Info size={14} color={colors.textSecondary} />
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>
              {t('dairy.gawali_note', 'Gawali accounts are created by the Gawali admin. Ask them to add a new gawali for your dairy.')}
            </Text>
          </View>
          {(gawalis.data ?? []).length === 0 ? (
            <EmptyState icon={<Truck size={32} color={colors.textMuted} />} title={t('dairy.no_gawalis', 'No gawalis yet')} />
          ) : (
            gawalis.data!.map((g) => (
              <Card key={g.id} style={styles.gawali} onPress={() => openGawali(g)}>
                <Truck size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{g.full_name}</Text>
                  <Text style={[styles.muted, { color: colors.textSecondary }]}>
                    {[g.phone, g.vehicle_number].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {!g.account_active ? (
                  <Badge label={t('admin_dashboard.suspended_badge', 'Suspended')} variant="error" size="sm" />
                ) : (
                  <Badge label={g.route_name ?? t('dairy.all_stops', 'All stops')} variant={g.route_name ? 'info' : 'neutral'} size="sm" />
                )}
              </Card>
            ))
          )}
        </ScrollView>
      </LoadState>

      <BottomSheetModal
        visible={!!routeSheet}
        onClose={() => setRouteSheet(null)}
        title={routeSheet?.route ? t('dairy.edit_route', 'Edit route') : t('dairy.add_route', 'New route')}
      >
        <View style={{ gap: 10 }}>
          <Input label={t('dairy.route_name', 'Route name')} placeholder="e.g. Baner Morning" value={routeName} onChangeText={setRouteName} error={routeError} />
          <Input label={t('dairy.route_desc', 'Areas covered (optional)')} value={routeDesc} onChangeText={setRouteDesc} />
          <Button title={t('settings.save', 'Save changes')} onPress={saveRoute} loading={createState.isLoading || updateState.isLoading} disabled={!routeName.trim()} />
        </View>
      </BottomSheetModal>

      <BottomSheetModal
        visible={!!orderRoute}
        onClose={() => !reordering && setOrderRoute(null)}
        title={t('dairy.stop_order', 'Set stop order')}
        subtitle={t('dairy.stop_order_sub', 'The order your gawali walks {{route}}', { route: orderRoute?.name ?? '' })}
      >
        <ScrollView style={{ maxHeight: 420 }}>
          {order.map((c, i) => (
            <View key={c.id} style={[styles.orderRow, { borderColor: colors.border }]}>
              <Text style={[styles.stopNum, { color: colors.primary }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderName, { color: colors.textPrimary }]}>{c.full_name}</Text>
                <Text style={[styles.muted, { color: colors.textMuted }]} numberOfLines={1}>
                  {[c.flat_or_house_number, c.address].filter(Boolean).join(', ')}
                </Text>
              </View>
              <TouchableOpacity disabled={i === 0} onPress={() => move(i, -1)} style={styles.iconBtn} accessibilityLabel={t('dairy.move_up', 'Move up')}>
                <ArrowUp size={18} color={i === 0 ? colors.border : colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity disabled={i === order.length - 1} onPress={() => move(i, 1)} style={styles.iconBtn} accessibilityLabel={t('dairy.move_down', 'Move down')}>
                <ArrowDown size={18} color={i === order.length - 1 ? colors.border : colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <Button title={t('settings.save', 'Save changes')} onPress={saveOrder} loading={reordering} style={{ marginTop: 12 }} />
      </BottomSheetModal>

      <BottomSheetModal visible={!!gawaliSheet} onClose={() => !savingGawali && setGawaliSheet(null)} title={gawaliSheet?.full_name ?? ''} subtitle={gawaliSheet?.phone ?? undefined}>
        <View style={{ gap: 10 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('dairy.assign_route', 'Delivers on')}</Text>
          <View style={styles.wrap}>
            <TouchableOpacity onPress={() => setGawaliRoute(null)} style={chip(gawaliRoute === null)}>
              <Text style={[styles.chipText, { color: gawaliRoute === null ? '#FFFFFF' : colors.textSecondary }]}>{t('dairy.all_stops', 'All stops')}</Text>
            </TouchableOpacity>
            {(routes.data ?? []).map((r) => (
              <TouchableOpacity key={r.id} onPress={() => setGawaliRoute(r.id)} style={chip(gawaliRoute === r.id)}>
                <Text style={[styles.chipText, { color: gawaliRoute === r.id ? '#FFFFFF' : colors.textSecondary }]}>{r.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input label={t('admin.vehicle', 'Vehicle number (optional)')} value={vehicle} onChangeText={setVehicle} autoCapitalize="characters" />
          <Button title={t('settings.save', 'Save changes')} onPress={saveGawali} loading={savingGawali} />
        </View>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 12 },
  heading: { fontSize: 17, fontWeight: '800', marginTop: 4 },
  section: { padding: 16, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 8 },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  gawali: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  stopNum: { width: 24, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  orderName: { fontSize: 14, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
});

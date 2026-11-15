import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, Button, Card, EmptyState, Header, LoadState, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { useGetDairyCustomersQuery, useGetRoutesQuery } from '../../shared/api/gawaliApi';
import { toNumber } from '../../shared/api/types';
import { formatCurrency, formatQuantity } from '../../shared/utils/formatters';

export const DairyCustomersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [routeId, setRouteId] = useState<string | undefined>(undefined);
  const [duesOnly, setDuesOnly] = useState(false);

  // Debounce typing so the server is not queried on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const customers = useGetDairyCustomersQuery({ search: search || undefined, route_id: routeId, has_dues: duesOnly });
  const routes = useGetRoutesQuery();
  const refreshControl = usePullToRefresh(customers.refetch);
  const list = customers.data ?? [];

  const Chip = ({ active, text, onPress }: { active: boolean; text: string; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.primary : isDark ? colors.surface : 'rgba(0,0,0,0.05)' }]}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('dairy.customers_title', 'Households')}
        subtitle={customers.data ? t('dairy.count', '{{count}} on your list', { count: list.length }) : undefined}
        rightAction={
          <Button title={t('dairy.add', 'Add')} icon={<UserPlus size={14} color="#FFFFFF" />} size="sm" onPress={() => navigation.navigate('DairyAddCustomer')} />
        }
      />

      <View style={styles.filters}>
        <View style={[styles.search, { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('dairy.search_customers', 'Search name, phone, flat')}
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip active={duesOnly} text={t('dairy.with_dues', 'With dues')} onPress={() => setDuesOnly((v) => !v)} />
          <Chip active={!routeId} text={t('dairy.all_routes', 'All routes')} onPress={() => setRouteId(undefined)} />
          <Chip active={routeId === 'none'} text={t('dairy.no_route', 'No route')} onPress={() => setRouteId('none')} />
          {(routes.data ?? []).map((r) => (
            <Chip key={r.id} active={routeId === r.id} text={r.name} onPress={() => setRouteId(r.id)} />
          ))}
        </ScrollView>
      </View>

      <LoadState isLoading={customers.isLoading} error={customers.error} hasData={!!customers.data} onRetry={customers.refetch}>
        <FlatList
          data={list}
          keyExtractor={(c) => c.id.toString()}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<StaleBanner error={customers.error} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Users size={36} color={colors.textMuted} />}
              title={search || routeId || duesOnly ? t('dairy.no_match', 'No households match') : t('dairy.no_customers', 'No households yet')}
              body={search || routeId || duesOnly ? undefined : t('dairy.no_customers_body', 'Add your first household to start their daily deliveries.')}
              action={
                !(search || routeId || duesOnly) ? (
                  <Button title={t('dairy.add_customer', 'Add a household')} onPress={() => navigation.navigate('DairyAddCustomer')} />
                ) : undefined
              }
            />
          }
          renderItem={({ item: c }) => {
            const due = toNumber(c.outstanding);
            return (
              <Card style={styles.row} onPress={() => navigation.navigate('DairyCustomerDetail', { customerId: c.id })}>
                <View style={[styles.avatar, { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>{c.full_name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {c.full_name}
                  </Text>
                  <Text style={[styles.muted, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[c.flat_or_house_number, c.address].filter(Boolean).join(', ')}
                  </Text>
                  <View style={styles.meta}>
                    {c.plan ? (
                      <Text style={[styles.muted, { color: colors.textMuted }]}>
                        {c.plan.product_name} · {formatQuantity(c.plan.default_quantity, c.plan.unit)}
                      </Text>
                    ) : (
                      <Badge label={t('dairy.no_plan', 'No plan')} variant="warning" size="sm" />
                    )}
                    {c.plan?.status === 'paused' && <Badge label={t('dairy.paused', 'Paused')} variant="neutral" size="sm" />}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {due > 0 && <Text style={styles.due}>{formatCurrency(due)}</Text>}
                  {c.route_name ? <Text style={[styles.muted, { color: colors.textMuted }]}>{c.route_name}</Text> : null}
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
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
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipText: { fontSize: 12, fontWeight: '600' },
  scroll: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  due: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
});

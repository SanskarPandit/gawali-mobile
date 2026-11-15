import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Building2,
  ChevronRight,
  ClipboardList,
  IndianRupee,
  MessageCircle,
  Milk,
  Phone,
  Route as RouteIcon,
  UserPlus,
  Users,
} from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Card, Header, LoadState, StaleBanner, StatCard, usePullToRefresh } from '../../shared/ui';
import { SettingsHeaderButton } from '../settings/SettingsHeaderButton';
import { useGetDairyDashboardQuery } from '../../shared/api/gawaliApi';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';

export const DairyDashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const dashboard = useGetDairyDashboardQuery();
  const refreshControl = usePullToRefresh(dashboard.refetch);
  const d = dashboard.data;

  const done = d?.today_delivered_count ?? 0;
  const total = d?.today_total_deliveries ?? 0;
  const percent = total ? Math.round((done / total) * 100) : 0;

  const manage = [
    { icon: UserPlus, title: t('dairy.add_customer', 'Add a household'), sub: t('dairy.add_customer_sub', 'New customer with a daily plan'), route: 'DairyAddCustomer' },
    { icon: RouteIcon, title: t('dairy.routes', 'Routes & gawalis'), sub: t('dairy.routes_sub', 'Delivery routes and who runs them'), route: 'DairyRoutes' },
    { icon: Building2, title: t('dairy.business', 'Business profile'), sub: t('dairy.business_sub', 'Cutoff time, UPI ID, address'), route: 'DairyBusinessProfile' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={d?.business_name ?? t('dairy.title', 'Dairy')}
        subtitle={t('dairy.subtitle', 'Today at a glance')}
        rightAction={<SettingsHeaderButton onPress={() => navigation.navigate('DairySettings')} />}
      />

      <LoadState isLoading={dashboard.isLoading} error={dashboard.error} hasData={!!d} onRetry={dashboard.refetch}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} refreshControl={refreshControl}>
          <StaleBanner error={dashboard.error} />

          {d && (
            <Card style={styles.section} onPress={() => navigation.navigate('DairyDeliveries')}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('dairy.today_run', "Today's deliveries")}</Text>
                  <Text style={[styles.big, { color: colors.textPrimary }]}>
                    {t('dairy.progress', '{{done}} of {{total}} delivered', { done, total })}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textMuted} />
              </View>
              <View style={[styles.track, { backgroundColor: isDark ? colors.surface : '#E2E8F0' }]}>
                <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                {t('dairy.cutoff_note', "Customers can change tomorrow's order until {{time}}", { time: d.cutoff_time.slice(0, 5) })}
              </Text>
            </Card>
          )}

          {d && (
            <View style={styles.statGrid}>
              <View style={styles.statRow}>
                <StatCard
                  title={t('dairy.volume', "Today's milk")}
                  value={formatLitres(d.today_volume_litres)}
                  icon={<Milk size={18} color={colors.primary} />}
                  style={{ marginRight: 8 }}
                  onPress={() => navigation.navigate('DairyDeliveries')}
                />
                <StatCard
                  title={t('dairy.customers', 'Active households')}
                  value={`${d.total_active_customers}`}
                  icon={<Users size={18} color={colors.primary} />}
                  style={{ marginLeft: 8 }}
                  onPress={() => navigation.navigate('DairyCustomers')}
                />
              </View>
              <View style={styles.statRow}>
                <StatCard
                  title={t('dairy.earned', 'Earned this month')}
                  value={formatCurrency(d.this_month_earned)}
                  icon={<IndianRupee size={18} color={colors.primary} />}
                  style={{ marginRight: 8 }}
                  onPress={() => navigation.navigate('DairyReports')}
                />
                <StatCard
                  title={t('dairy.dues', 'Unpaid dues')}
                  value={formatCurrency(d.total_outstanding_dues)}
                  icon={<AlertCircle size={18} color={d.total_outstanding_dues > 0 ? '#DC2626' : colors.primary} />}
                  style={{ marginLeft: 8 }}
                />
              </View>
            </View>
          )}

          <Card style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.manage', 'Manage')}</Text>
            {manage.map(({ icon: Icon, title, sub, route }) => (
              <TouchableOpacity key={route} onPress={() => navigation.navigate(route)} style={[styles.manageRow, { borderColor: colors.border }]} accessibilityRole="button">
                <View style={[styles.manageIcon, { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}>
                  <Icon size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.manageTitle, { color: colors.textPrimary }]}>{title}</Text>
                  <Text style={[styles.muted, { color: colors.textSecondary }]}>{sub}</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </Card>

          {d && d.overdue_customers.length > 0 && (
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dairy.collect', 'Collect dues')}</Text>
                <ClipboardList size={18} color={colors.textMuted} />
              </View>
              {d.overdue_customers.map((c) => (
                <View key={c.bill_id} style={[styles.dueRow, { borderColor: colors.border }]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('DairyCustomerDetail', { customerId: c.customer_id })}>
                    <Text style={[styles.manageTitle, { color: colors.textPrimary }]}>{c.customer_name}</Text>
                    <Text style={[styles.muted, { color: colors.textSecondary }]}>
                      {c.billing_month} · <Text style={{ color: '#DC2626', fontWeight: '700' }}>{formatCurrency(c.due_amount)}</Text>
                    </Text>
                  </TouchableOpacity>
                  {c.whatsapp_url ? (
                    <TouchableOpacity onPress={() => Linking.openURL(c.whatsapp_url!)} style={styles.iconBtn} accessibilityLabel={`WhatsApp ${c.customer_name}`}>
                      <MessageCircle size={18} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                  {c.call_phone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.call_phone}`)} style={styles.iconBtn} accessibilityLabel={`Call ${c.customer_name}`}>
                      <Phone size={18} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      </LoadState>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  section: { padding: 16, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 12, fontWeight: '600' },
  big: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  muted: { fontSize: 12 },
  statGrid: { gap: 12 },
  statRow: { flexDirection: 'row' },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  manageIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  manageTitle: { fontSize: 14, fontWeight: '700' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { padding: 8 },
});

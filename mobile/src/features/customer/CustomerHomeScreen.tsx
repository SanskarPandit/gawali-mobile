import React, { useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addDays, format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, MessageCircle, PauseCircle, Phone } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, Button, Card, LoadState, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { errorMessage } from '../../shared/ui/QueryStates';
import { DemoModeBar } from '../../app/session/DemoModeBar';
import { useGetCalendarQuery, useGetCustomerDashboardQuery, useSetDayQuantityMutation, useUpdatePlanMutation } from '../../shared/api/gawaliApi';
import { CalendarDay, toNumber } from '../../shared/api/types';
import { formatCurrency, formatQuantity } from '../../shared/utils/formatters';
import { DayQuantitySheet, DayTarget } from './components/DayQuantitySheet';

const STATUS_BADGE: Record<string, { key: string; fallback: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'emerald' }> = {
  delivered: { key: 'common.delivered', fallback: 'Delivered', variant: 'success' },
  pending: { key: 'common.on_the_way', fallback: 'On the way', variant: 'info' },
  skipped: { key: 'common.skipped', fallback: 'Skipped', variant: 'neutral' },
  missed: { key: 'common.missed', fallback: 'Missed', variant: 'error' },
  scheduled: { key: 'common.scheduled', fallback: 'Scheduled', variant: 'emerald' },
  vacation: { key: 'common.vacation', fallback: 'Vacation', variant: 'warning' },
  none: { key: 'common.no_delivery', fallback: 'No delivery', variant: 'neutral' },
};

export const CustomerHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<DayTarget | null>(null);

  const dashboard = useGetCustomerDashboardQuery();
  const now = new Date();
  const weekEnd = addDays(now, 7);
  const thisMonth = useGetCalendarQuery({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const crossesMonth = weekEnd.getMonth() !== now.getMonth();
  const nextMonth = useGetCalendarQuery(
    { year: weekEnd.getFullYear(), month: weekEnd.getMonth() + 1 },
    { skip: !crossesMonth }
  );
  const [updatePlan, { isLoading: resuming }] = useUpdatePlanMutation();
  const [setDay, { isLoading: quickSaving }] = useSetDayQuantityMutation();

  const refetchAll = async () => {
    await Promise.all([dashboard.refetch(), thisMonth.refetch(), crossesMonth ? nextMonth.refetch() : null]);
  };
  const refreshControl = usePullToRefresh(refetchAll);

  const data = dashboard.data;
  const plan = data?.subscription;
  const unit = plan?.unit ?? 'L';
  const defaultQty = toNumber(plan?.default_quantity);

  const upcoming: CalendarDay[] = useMemo(() => {
    const days = [...(thisMonth.data?.days ?? []), ...(crossesMonth ? nextMonth.data?.days ?? [] : [])];
    const todayKey = format(now, 'yyyy-MM-dd');
    return days.filter((d) => d.date >= todayKey).slice(0, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thisMonth.data, nextMonth.data, crossesMonth]);

  const nextChangeable = upcoming.find((d) => d.date === data?.earliest_changeable_date);

  const openDay = (day: CalendarDay) => {
    if (!day.can_modify) {
      Alert.alert(
        t('customer_home.locked_title', 'This day is locked'),
        day.is_vacation
          ? t('customer_home.locked_vacation', 'You are on vacation this day. Change it from the Calendar tab.')
          : t('customer_home.locked_cutoff', 'Changes close at {{time}} the night before.', {
              time: (data?.dairy?.cutoff_time ?? '22:00').slice(0, 5),
            })
      );
      return;
    }
    setSheet({ date: day.date, quantity: toNumber(day.scheduled_quantity), overrideId: day.override_id });
  };

  const toggleSkip = async (day: CalendarDay) => {
    const skipping = toNumber(day.scheduled_quantity) > 0;
    try {
      await setDay({ date: day.date, quantity: (skipping ? 0 : defaultQty).toFixed(2) }).unwrap();
    } catch (e) {
      Alert.alert(t("customer_calendar.not_saved", "Not saved"), errorMessage(e));
    }
  };

  const resumePlan = async () => {
    try {
      const res = await updatePlan({ status: 'active' }).unwrap();
      Alert.alert(t('customer_home.resumed', 'Plan resumed'), res.message);
    } catch (e) {
      Alert.alert(t('customer_calendar.not_saved', 'Not saved'), errorMessage(e));
    }
  };

  const dairyPhone = data?.dairy?.phone ?? '';
  const whatsapp = () =>
    Linking.openURL(`https://wa.me/${dairyPhone.replace(/\D/g, '')}`).catch(() =>
      Alert.alert(t('common.cannot_open', 'Could not open WhatsApp'))
    );

  const todayStatus = data?.today_delivery?.status ?? (plan ? 'none' : 'none');
  const todayBadge = STATUS_BADGE[todayStatus] ?? STATUS_BADGE.none;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16), borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{t('customer_home.hello', 'Namaste,')}</Text>
            <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
              {data?.customer_name ?? ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('CustomerProfile')}
            style={[styles.avatar, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={t('nav.profile', 'Profile')}
          >
            <Text style={styles.avatarLetter}>{(data?.customer_name ?? '?').charAt(0)}</Text>
          </TouchableOpacity>
        </View>
        <DemoModeBar />
      </View>

      <LoadState isLoading={dashboard.isLoading} error={dashboard.error} hasData={!!data} onRetry={dashboard.refetch}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          <StaleBanner error={dashboard.error} />

          {data?.unpaid_bill && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('CustomerBills')}
              style={styles.billBanner}
              accessibilityRole="button"
            >
              <AlertTriangle size={20} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={styles.billTitle}>
                  {t('customer_home.bill_due', '{{month}} bill: {{amount}} due', {
                    month: data.unpaid_bill.month,
                    amount: formatCurrency(data.unpaid_bill.due_amount),
                  })}
                </Text>
                {data.unpaid_bill.due_date ? (
                  <Text style={styles.billSub}>
                    {t('customer_home.pay_by', 'Pay by {{date}}', { date: format(parseISO(data.unpaid_bill.due_date), 'd MMM') })}
                  </Text>
                ) : null}
              </View>
              <ChevronRight size={16} color="#92400E" />
            </TouchableOpacity>
          )}

          {plan?.status === 'paused' && (
            <Card style={styles.pausedCard} variant="outlined">
              <PauseCircle size={20} color={colors.textSecondary} />
              <Text style={[styles.pausedText, { color: colors.textSecondary }]}>
                {t('customer_home.paused', 'Your deliveries are paused.')}
              </Text>
              <Button title={t('customer_home.resume', 'Resume')} size="sm" onPress={resumePlan} loading={resuming} />
            </Card>
          )}

          {!plan && (
            <Card style={styles.section}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {t('customer_home.no_plan', 'No daily plan yet')}
              </Text>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                {t('customer_home.no_plan_body', 'Ask your dairy to start your plan, or pick one from the Calendar tab.')}
              </Text>
            </Card>
          )}

          {/* Today */}
          {plan && (
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                    {t('customer_home.today_delivery', "Today's delivery")} · {format(now, 'd MMM')}
                  </Text>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{plan.product_name}</Text>
                </View>
                <Badge label={t(todayBadge.key, todayBadge.fallback)} variant={todayBadge.variant} />
              </View>
              <View style={styles.metrics}>
                <View style={styles.metric}>
                  <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                    {data?.today_delivery?.status === 'delivered' ? t('customer_home.delivered_qty', 'Delivered') : t('customer_home.scheduled_qty', 'Scheduled')}
                  </Text>
                  <Text style={[styles.metricValue, { color: colors.primary }]}>
                    {formatQuantity(
                      data?.today_delivery?.status === 'delivered'
                        ? data.today_delivery.delivered_quantity
                        : data?.today_delivery?.scheduled_quantity ?? 0,
                      unit
                    )}
                  </Text>
                </View>
                <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
                <View style={styles.metric}>
                  <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{t('customer_home.time', 'Time')}</Text>
                  <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                    {data?.today_delivery?.delivered_at ? format(parseISO(data.today_delivery.delivered_at), 'h:mm a') : '—'}
                  </Text>
                </View>
              </View>
              {data?.today_delivery?.status === 'delivered' && (
                <View style={[styles.statusStrip, { backgroundColor: isDark ? colors.surface : '#F0FDF4' }]}>
                  <CheckCircle2 size={16} color={colors.primary} />
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
                    {t('customer_home.delivered_msg', 'Delivered to your door')}
                  </Text>
                </View>
              )}
            </Card>
          )}

          {/* Next changeable day */}
          {plan?.status === 'active' && nextChangeable && (
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                    {format(parseISO(nextChangeable.date), 'EEEE, d MMM')}
                  </Text>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                    {formatQuantity(nextChangeable.scheduled_quantity, unit)}
                  </Text>
                </View>
                <Badge
                  label={
                    nextChangeable.is_vacation
                      ? t('common.vacation', 'Vacation')
                      : toNumber(nextChangeable.scheduled_quantity) === 0
                        ? t('common.skipped', 'Skipped')
                        : nextChangeable.override_id
                          ? t('common.changed', 'Changed')
                          : t('common.scheduled', 'Scheduled')
                  }
                  variant={toNumber(nextChangeable.scheduled_quantity) === 0 ? 'neutral' : nextChangeable.override_id ? 'warning' : 'emerald'}
                />
              </View>
              <View style={styles.cutoffRow}>
                <Clock size={13} color={colors.textSecondary} />
                <Text style={[styles.muted, { color: colors.textSecondary }]}>
                  {t('customer_home.cutoff', 'You can change this until {{time}} the night before.', {
                    time: (data?.dairy?.cutoff_time ?? '22:00').slice(0, 5),
                  })}
                </Text>
              </View>
              {nextChangeable.can_modify && (
                <View style={styles.actions}>
                  <Button
                    title={
                      toNumber(nextChangeable.scheduled_quantity) === 0
                        ? t('customer_home.resume_day', 'Resume')
                        : t('customer_home.skip', 'Skip')
                    }
                    variant="outline"
                    size="sm"
                    style={{ flex: 1 }}
                    loading={quickSaving}
                    onPress={() => toggleSkip(nextChangeable)}
                  />
                  <Button
                    title={t('customer_home.change', 'Change quantity')}
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => openDay(nextChangeable)}
                  />
                </View>
              )}
            </Card>
          )}

          {/* Week ahead */}
          {plan && upcoming.length > 0 && (
            <>
              <View style={styles.rowBetween}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('customer_home.week', 'Next 7 days')}</Text>
                <TouchableOpacity onPress={() => navigation.navigate('CustomerCalendar')} style={styles.link}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('customer_home.full_month', 'Full month')}</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {upcoming.map((day) => {
                  const qty = toNumber(day.scheduled_quantity);
                  const changed = !!day.override_id;
                  return (
                    <TouchableOpacity
                      key={day.date}
                      onPress={() => openDay(day)}
                      style={[
                        styles.dayChip,
                        {
                          borderColor: day.is_today ? colors.primary : colors.border,
                          backgroundColor: isDark ? colors.surface : '#FFFFFF',
                          opacity: day.can_modify || day.is_today ? 1 : 0.7,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${format(parseISO(day.date), 'EEEE d MMMM')}: ${formatQuantity(qty, unit)}`}
                    >
                      <Text style={[styles.dayName, { color: day.is_today ? colors.primary : colors.textSecondary }]}>
                        {day.is_today ? t('common.today', 'Today') : day.weekday}
                      </Text>
                      <Text style={[styles.dayNum, { color: colors.textPrimary }]}>{day.day}</Text>
                      <Text
                        style={[
                          styles.dayQty,
                          { color: day.is_vacation ? '#B45309' : qty === 0 ? colors.textMuted : changed ? '#B45309' : colors.primary },
                        ]}
                      >
                        {day.is_vacation ? '✈' : qty === 0 ? '—' : formatQuantity(qty, unit)}
                      </Text>
                      {day.extras.length > 0 && <View style={[styles.extraDot, { backgroundColor: colors.primary }]} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* This month */}
          {plan && data && (
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('customer_home.month_spend', 'This month so far')}</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{formatCurrency(data.this_month_so_far.estimated_amount)}</Text>
                <Text style={[styles.statSub, { color: colors.textMuted }]}>
                  {t('customer_home.month_days', '{{qty}} over {{days}} days', {
                    qty: formatQuantity(data.this_month_so_far.delivered_quantity, unit),
                    days: data.this_month_so_far.delivered_days,
                  })}
                </Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('customer_home.rate', 'Your rate')}</Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {formatCurrency(plan.price_per_unit)}
                  <Text style={{ fontSize: 13 }}> /{unit}</Text>
                </Text>
                <Text style={[styles.statSub, { color: colors.textMuted }]}>
                  {formatQuantity(plan.default_quantity, unit)} {t('customer_home.per_day', 'per day')}
                </Text>
              </Card>
            </View>
          )}

          {/* Dairy */}
          {data?.dairy && (
            <Card style={styles.section} variant="outlined">
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{t('customer_home.your_dairy', 'Your dairy')}</Text>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{data.dairy.name}</Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={whatsapp} style={[styles.contactBtn, { borderColor: colors.border }]} accessibilityRole="button">
                  <MessageCircle size={16} color={colors.primary} />
                  <Text style={[styles.contactText, { color: colors.primary }]}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${dairyPhone}`)} style={[styles.contactBtn, { borderColor: colors.border }]} accessibilityRole="button">
                  <Phone size={16} color={colors.primary} />
                  <Text style={[styles.contactText, { color: colors.primary }]}>{t('customer_home.call', 'Call')}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          )}
        </ScrollView>
      </LoadState>

      <DayQuantitySheet target={sheet} defaultQuantity={defaultQty} unit={unit} onClose={() => setSheet(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 13, fontWeight: '500' },
  userName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  scrollContent: { padding: 16, gap: 14 },
  billBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  billTitle: { fontWeight: '700', color: '#92400E', fontSize: 13 },
  billSub: { fontSize: 11, color: '#B45309', marginTop: 2 },
  pausedCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  pausedText: { flex: 1, fontSize: 13, fontWeight: '600' },
  section: { padding: 16, gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardSub: { fontSize: 12, fontWeight: '500' },
  cardTitle: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  muted: { fontSize: 12, lineHeight: 18, flex: 1 },
  metrics: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1 },
  metricDivider: { width: StyleSheet.hairlineWidth, height: 32, marginHorizontal: 12 },
  metricLabel: { fontSize: 12, fontWeight: '500' },
  metricValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  statusStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10 },
  cutoffRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dayChip: { width: 64, alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  dayName: { fontSize: 11, fontWeight: '600' },
  dayNum: { fontSize: 18, fontWeight: '800', marginVertical: 2 },
  dayQty: { fontSize: 11, fontWeight: '700' },
  extraDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, padding: 14, gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  statSub: { fontSize: 11 },
  contactBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  contactText: { fontSize: 13, fontWeight: '700' },
});

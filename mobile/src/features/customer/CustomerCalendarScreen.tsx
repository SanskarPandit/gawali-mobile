import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addDays, addMonths, format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Palmtree, PauseCircle, PlayCircle, SlidersHorizontal, X } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { BottomSheetModal, Button, Card, Header, LoadState, QuantityStepper, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { errorMessage } from '../../shared/ui/QueryStates';
import {
  useCancelVacationMutation,
  useCreateVacationMutation,
  useGetCalendarQuery,
  useGetCustomerDashboardQuery,
  useUpdatePlanMutation,
} from '../../shared/api/gawaliApi';
import { CalendarDay, toNumber } from '../../shared/api/types';
import { formatQuantity } from '../../shared/utils/formatters';
import { DayQuantitySheet, DayTarget } from './components/DayQuantitySheet';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CustomerCalendarScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [sheet, setSheet] = useState<DayTarget | null>(null);
  const [planSheet, setPlanSheet] = useState(false);
  const [planQty, setPlanQty] = useState(1);
  const [vacationSheet, setVacationSheet] = useState(false);
  const [vacStart, setVacStart] = useState<string | null>(null);
  const [vacDays, setVacDays] = useState(3);

  const cal = useGetCalendarQuery({ year: month.getFullYear(), month: month.getMonth() + 1 });
  const dashboard = useGetCustomerDashboardQuery();
  const [updatePlan, { isLoading: savingPlan }] = useUpdatePlanMutation();
  const [createVacation, { isLoading: savingVacation }] = useCreateVacationMutation();
  const [cancelVacation] = useCancelVacationMutation();
  const refreshControl = usePullToRefresh(async () => {
    await Promise.all([cal.refetch(), dashboard.refetch()]);
  });

  const data = cal.data;
  const plan = dashboard.data?.subscription;
  const unit = data?.unit ?? 'L';
  const defaultQty = toNumber(data?.default_quantity);
  const earliest = data?.earliest_changeable_date ?? dashboard.data?.earliest_changeable_date;

  const cells = useMemo(() => {
    if (!data) return [];
    const lead = new Date(data.year, data.month - 1, 1).getDay();
    return [...Array(lead).fill(null), ...data.days] as (CalendarDay | null)[];
  }, [data]);

  const monthTotal = useMemo(
    () => (data?.days ?? []).reduce((sum, d) => sum + (d.status === 'delivered' ? toNumber(d.actual_quantity) : 0), 0),
    [data]
  );

  const thisMonth = new Date();
  const canGoBack = month > new Date(thisMonth.getFullYear() - 1, thisMonth.getMonth(), 1);
  const canGoForward = month < new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 3, 1);

  const onDayPress = (day: CalendarDay) => {
    if (day.can_modify) {
      setSheet({ date: day.date, quantity: toNumber(day.scheduled_quantity), overrideId: day.override_id });
      return;
    }
    const lines = [
      `${t('customer_calendar.status', 'Status')}: ${statusLabel(day)}`,
      day.status === 'delivered' ? `${t('common.delivered', 'Delivered')}: ${formatQuantity(day.actual_quantity, unit)}` : null,
      ...day.extras.map((x) => `+ ${x.product_name} × ${toNumber(x.quantity)}`),
      !day.is_past && !day.is_vacation ? t('customer_calendar.locked', 'This day can no longer be changed.') : null,
    ].filter(Boolean);
    Alert.alert(format(parseISO(day.date), 'EEEE, d MMMM'), lines.join('\n'));
  };

  const statusLabel = (day: CalendarDay) =>
    ({
      delivered: t('common.delivered', 'Delivered'),
      pending: t('common.on_the_way', 'On the way'),
      skipped: t('common.skipped', 'Skipped'),
      missed: t('common.missed', 'Missed'),
      scheduled: t('common.scheduled', 'Scheduled'),
      vacation: t('common.vacation', 'Vacation'),
      none: t('common.no_delivery', 'No delivery'),
      no_record: t('common.no_delivery', 'No delivery'),
    })[day.status];

  const cellStyle = (day: CalendarDay) => {
    if (day.is_vacation) return { bg: isDark ? '#3B2F12' : '#FEF3C7', fg: '#B45309' };
    switch (day.status) {
      case 'delivered':
        return { bg: isDark ? '#0F2E22' : '#DCFCE7', fg: colors.primary };
      case 'skipped':
        return { bg: isDark ? colors.surface : '#F1F5F9', fg: colors.textMuted };
      case 'missed':
        return { bg: isDark ? '#3A1414' : '#FEE2E2', fg: '#DC2626' };
      default:
        return { bg: isDark ? colors.surface : '#FFFFFF', fg: day.override_id ? '#B45309' : colors.textPrimary };
    }
  };

  const savePlanQty = async () => {
    try {
      const res = await updatePlan({ default_quantity: planQty.toFixed(2) }).unwrap();
      setPlanSheet(false);
      Alert.alert(t('customer_calendar.plan_saved', 'Plan updated'), res.message);
    } catch (e) {
      Alert.alert(t('customer_calendar.not_saved', 'Not saved'), errorMessage(e));
    }
  };

  const togglePause = () => {
    const pausing = plan?.status === 'active';
    Alert.alert(
      pausing ? t('customer_calendar.pause_title', 'Pause deliveries?') : t('customer_calendar.resume_title', 'Resume deliveries?'),
      pausing
        ? t('customer_calendar.pause_body', 'Deliveries stop from {{date}} until you resume. For a fixed trip, add a vacation instead.', {
            date: earliest ? format(parseISO(earliest), 'd MMM') : '',
          })
        : t('customer_calendar.resume_body', 'Deliveries restart from {{date}}.', { date: earliest ? format(parseISO(earliest), 'd MMM') : '' }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: pausing ? t('customer_calendar.pause', 'Pause') : t('customer_calendar.resume', 'Resume'),
          onPress: async () => {
            try {
              await updatePlan({ status: pausing ? 'paused' : 'active' }).unwrap();
            } catch (e) {
              Alert.alert(t('customer_calendar.not_saved', 'Not saved'), errorMessage(e));
            }
          },
        },
      ]
    );
  };

  const vacationStarts = useMemo(() => {
    if (!earliest) return [];
    return Array.from({ length: 21 }, (_, i) => format(addDays(parseISO(earliest), i), 'yyyy-MM-dd'));
  }, [earliest]);

  const saveVacation = async () => {
    if (!vacStart) return;
    const end = format(addDays(parseISO(vacStart), vacDays - 1), 'yyyy-MM-dd');
    try {
      await createVacation({ start_date: vacStart, end_date: end }).unwrap();
      setVacationSheet(false);
      Alert.alert(
        t('customer_calendar.vacation_saved', 'Vacation added'),
        t('customer_calendar.vacation_saved_body', 'No deliveries from {{from}} to {{to}}.', {
          from: format(parseISO(vacStart), 'd MMM'),
          to: format(parseISO(end), 'd MMM'),
        })
      );
    } catch (e) {
      Alert.alert(t('customer_calendar.not_saved', 'Not saved'), errorMessage(e));
    }
  };

  const endVacation = (id: string) =>
    Alert.alert(t('customer_calendar.end_vacation', 'End this vacation?'), '', [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('customer_calendar.end', 'End vacation'),
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await cancelVacation(id).unwrap();
            Alert.alert(res.message);
          } catch (e) {
            Alert.alert(t('customer_calendar.not_saved', 'Not saved'), errorMessage(e));
          }
        },
      },
    ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={t('customer_calendar.title', 'Delivery calendar')} subtitle={t('customer_calendar.subtitle', 'Tap a day to skip or change it')} />

      <LoadState isLoading={cal.isLoading} error={cal.error} hasData={!!data} onRetry={cal.refetch}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          <StaleBanner error={cal.error} />

          <Card style={styles.section}>
            <View style={styles.monthRow}>
              <TouchableOpacity disabled={!canGoBack} onPress={() => setMonth((m) => addMonths(m, -1))} hitSlop={10} accessibilityLabel={t('customer_calendar.prev', 'Previous month')}>
                <ChevronLeft size={22} color={canGoBack ? colors.textPrimary : colors.border} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>{format(month, 'MMMM yyyy')}</Text>
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  {t('customer_calendar.month_total', '{{qty}} delivered', { qty: formatQuantity(monthTotal, unit) })}
                </Text>
              </View>
              <TouchableOpacity disabled={!canGoForward} onPress={() => setMonth((m) => addMonths(m, 1))} hitSlop={10} accessibilityLabel={t('customer_calendar.next', 'Next month')}>
                <ChevronRight size={22} color={canGoForward ? colors.textPrimary : colors.border} />
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={[styles.weekday, { color: colors.textMuted }]}>
                  {w}
                </Text>
              ))}
              {cells.map((day, i) =>
                day ? (
                  <TouchableOpacity
                    key={day.date}
                    onPress={() => onDayPress(day)}
                    style={[
                      styles.cell,
                      { backgroundColor: cellStyle(day).bg, borderColor: day.is_today ? colors.primary : 'transparent' },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${format(parseISO(day.date), 'd MMMM')}: ${statusLabel(day)}`}
                  >
                    <Text style={[styles.cellDay, { color: colors.textPrimary }]}>{day.day}</Text>
                    <Text style={[styles.cellQty, { color: cellStyle(day).fg }]} numberOfLines={1}>
                      {day.is_vacation
                        ? '✈'
                        : day.status === 'delivered'
                          ? toNumber(day.actual_quantity)
                          : toNumber(day.scheduled_quantity) > 0
                            ? toNumber(day.scheduled_quantity)
                            : '—'}
                    </Text>
                    {day.extras.length > 0 && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                  </TouchableOpacity>
                ) : (
                  <View key={`blank-${i}`} style={styles.cell} />
                )
              )}
            </View>

            <View style={styles.legend}>
              {[
                { c: isDark ? '#0F2E22' : '#DCFCE7', l: t('common.delivered', 'Delivered') },
                { c: isDark ? '#3B2F12' : '#FEF3C7', l: t('common.vacation', 'Vacation') },
                { c: isDark ? '#3A1414' : '#FEE2E2', l: t('common.missed', 'Missed') },
              ].map((x) => (
                <View key={x.l} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: x.c }]} />
                  <Text style={[styles.muted, { color: colors.textSecondary }]}>{x.l}</Text>
                </View>
              ))}
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: colors.primary, marginTop: 0 }]} />
                <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('customer_calendar.extras', 'Extras')}</Text>
              </View>
            </View>
          </Card>

          {/* Plan */}
          {plan && (
            <Card style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('customer_calendar.plan', 'Daily plan')}</Text>
              <Text style={[styles.planLine, { color: colors.textSecondary }]}>
                {plan.product_name} · {formatQuantity(plan.default_quantity, unit)} {t('customer_home.per_day', 'per day')} ·{' '}
                {plan.status === 'active' ? t('customer_calendar.active', 'Active') : t('customer_calendar.paused', 'Paused')}
              </Text>
              <View style={styles.actions}>
                <Button
                  title={t('customer_calendar.change_daily', 'Change daily quantity')}
                  icon={<SlidersHorizontal size={14} color={colors.primary} />}
                  variant="outline"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setPlanQty(toNumber(plan.default_quantity));
                    setPlanSheet(true);
                  }}
                />
                <Button
                  title={plan.status === 'active' ? t('customer_calendar.pause', 'Pause') : t('customer_calendar.resume', 'Resume')}
                  icon={plan.status === 'active' ? <PauseCircle size={14} color={colors.primary} /> : <PlayCircle size={14} color={colors.primary} />}
                  variant="outline"
                  size="sm"
                  onPress={togglePause}
                />
              </View>
            </Card>
          )}

          {/* Vacations */}
          {plan && (
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('customer_calendar.vacations', 'Vacations')}</Text>
                <Button
                  title={t('customer_calendar.add_vacation', 'Add')}
                  icon={<Palmtree size={14} color="#FFFFFF" />}
                  size="sm"
                  onPress={() => {
                    setVacStart(vacationStarts[0] ?? null);
                    setVacDays(3);
                    setVacationSheet(true);
                  }}
                />
              </View>
              {(data?.vacations ?? []).length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  {t('customer_calendar.no_vacations', 'Going away? Pause deliveries for those days in one step.')}
                </Text>
              ) : (
                data!.vacations.map((v) => (
                  <View key={v.id} style={[styles.vacationRow, { borderColor: colors.border }]}>
                    <Palmtree size={16} color="#B45309" />
                    <Text style={[styles.vacationText, { color: colors.textPrimary }]}>
                      {format(parseISO(v.start_date), 'd MMM')} – {format(parseISO(v.end_date), 'd MMM')}
                    </Text>
                    <TouchableOpacity onPress={() => endVacation(v.id)} hitSlop={8} accessibilityLabel={t('customer_calendar.end', 'End vacation')}>
                      <X size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </Card>
          )}
        </ScrollView>
      </LoadState>

      <DayQuantitySheet target={sheet} defaultQuantity={defaultQty} unit={unit} onClose={() => setSheet(null)} />

      <BottomSheetModal
        visible={planSheet}
        onClose={() => !savingPlan && setPlanSheet(false)}
        title={t('customer_calendar.change_daily', 'Change daily quantity')}
        subtitle={earliest ? t('customer_calendar.applies_from', 'Applies from {{date}}', { date: format(parseISO(earliest), 'd MMM') }) : undefined}
      >
        <View style={{ gap: 16, alignItems: 'stretch' }}>
          <View style={{ alignItems: 'center' }}>
            <QuantityStepper value={planQty} onChange={setPlanQty} step={0.25} min={0.25} max={20} unit={unit} size="lg" />
          </View>
          <Button title={t('settings.save', 'Save changes')} onPress={savePlanQty} loading={savingPlan} disabled={planQty === defaultQty} />
        </View>
      </BottomSheetModal>

      <BottomSheetModal
        visible={vacationSheet}
        onClose={() => !savingVacation && setVacationSheet(false)}
        title={t('customer_calendar.add_vacation_title', 'Pause for a vacation')}
        subtitle={t('customer_calendar.add_vacation_sub', 'No milk and no charge for these days')}
      >
        <View style={{ gap: 14 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('customer_calendar.from', 'From')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {vacationStarts.map((d) => {
              const active = vacStart === d;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setVacStart(d)}
                  style={[styles.dateChip, { borderColor: active ? colors.primary : colors.border }, active && { backgroundColor: colors.primary }]}
                >
                  <Text style={{ fontSize: 11, color: active ? '#FFFFFF' : colors.textSecondary }}>{format(parseISO(d), 'EEE')}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: active ? '#FFFFFF' : colors.textPrimary }}>{format(parseISO(d), 'd MMM')}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('customer_calendar.days', 'Number of days')}</Text>
          <View style={{ alignItems: 'center' }}>
            <QuantityStepper value={vacDays} onChange={(v) => setVacDays(Math.round(v))} step={1} min={1} max={90} unit={t('customer_calendar.days_unit', 'days')} />
          </View>
          {vacStart && (
            <Text style={[styles.muted, { color: colors.textSecondary, textAlign: 'center' }]}>
              {format(parseISO(vacStart), 'd MMM')} – {format(addDays(parseISO(vacStart), vacDays - 1), 'd MMM yyyy')}
            </Text>
          )}
          <Button title={t('customer_calendar.save_vacation', 'Save vacation')} onPress={saveVacation} loading={savingVacation} disabled={!vacStart} />
        </View>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },
  section: { padding: 16, gap: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 17, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.85,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  cellDay: { fontSize: 13, fontWeight: '700' },
  cellQty: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  muted: { fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  planLine: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vacationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  vacationText: { flex: 1, fontSize: 14, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  dateChip: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
});

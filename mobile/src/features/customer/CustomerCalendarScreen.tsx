import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isBefore,
  startOfToday,
} from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, BottomSheetModal, QuantityStepper, Button } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { setDayOverride, resetDayOverride } from '../../app/store/subscriptionSlice';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';

export const CustomerCalendarScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { defaultPlan, overrides } = useAppSelector((state) => state.subscription);

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalQty, setModalQty] = useState(defaultPlan.quantity);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calculate monthly stats
  let totalLitres = 0;
  let deliveredOrPlannedDays = 0;
  let skippedDays = 0;

  daysInMonth.forEach((day) => {
    const key = format(day, 'yyyy-MM-dd');
    const override = overrides[key];
    const qty = override ? override.quantity : defaultPlan.quantity;
    totalLitres += qty;
    if (qty > 0) {
      deliveredOrPlannedDays++;
    } else {
      skippedDays++;
    }
  });

  const handleDayPress = (day: Date) => {
    const isPast = isBefore(day, startOfToday());
    if (isPast) {
      // Past day cannot be modified
      return;
    }
    const key = format(day, 'yyyy-MM-dd');
    const existing = overrides[key];
    setSelectedDay(day);
    setModalQty(existing ? existing.quantity : defaultPlan.quantity);
    setModalVisible(true);
  };

  const handleSaveOverride = () => {
    if (selectedDay) {
      const dateStr = format(selectedDay, 'yyyy-MM-dd');
      dispatch(
        setDayOverride({
          date: dateStr,
          quantity: modalQty,
        })
      );
      setModalVisible(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Delivery Calendar"
        subtitle="Manage skips and extra milk"
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Selector Bar */}
        <View style={styles.monthHeaderRow}>
          <TouchableOpacity
            onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}
            style={[styles.arrowBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
          >
            <Text style={[styles.arrowText, { color: colors.textPrimary }]}>‹</Text>
          </TouchableOpacity>

          <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
            {format(currentMonth, 'MMMM yyyy')}
          </Text>

          <TouchableOpacity
            onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}
            style={[styles.arrowBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
          >
            <Text style={[styles.arrowText, { color: colors.textPrimary }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Days of week header */}
        <View style={styles.weekHeader}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
            <Text key={w} style={[styles.weekHeaderText, { color: colors.textSecondary }]}>
              {w}
            </Text>
          ))}
        </View>

        {/* Month Calendar Grid */}
        <Card style={styles.calendarCard}>
          <View style={styles.daysGrid}>
            {daysInMonth.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const override = overrides[key];
              const qty = override ? override.quantity : defaultPlan.quantity;
              const isToday = isSameDay(day, new Date());
              const isPast = isBefore(day, startOfToday());
              const isSkipped = qty === 0;

              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={isPast ? 1 : 0.6}
                  onPress={() => handleDayPress(day)}
                  style={[
                    styles.dayCell,
                    isToday && { borderColor: colors.primary, borderWidth: 1.5 },
                    {
                      backgroundColor: isPast
                        ? isDark ? '#1E293B' : '#F8FAFC'
                        : isSkipped
                        ? isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2'
                        : override
                        ? isDark ? 'rgba(14, 163, 113, 0.2)' : '#ECFDF5'
                        : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.cellDayNum,
                      {
                        color: isToday
                          ? colors.primary
                          : isPast
                          ? colors.textMuted
                          : colors.textPrimary,
                        fontWeight: isToday ? '800' : '600',
                      },
                    ]}
                  >
                    {format(day, 'd')}
                  </Text>

                  <View style={styles.qtyIndicator}>
                    {isSkipped ? (
                      <Text style={[styles.skipTag, { color: '#EF4444' }]}>SKIP</Text>
                    ) : (
                      <Text
                        style={[
                          styles.qtyTag,
                          { color: override ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {qty}L
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Calendar Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Scheduled</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Skipped (0L)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#94A3B8' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Past Delivered</Text>
          </View>
        </View>

        {/* Monthly Summary Statistics Card */}
        <Card style={styles.summaryCard}>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
            {format(currentMonth, 'MMMM')} Month Estimate
          </Text>

          <View style={styles.summaryMetrics}>
            <View style={styles.summaryMetricItem}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Litres</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {formatLitres(totalLitres)}
              </Text>
            </View>

            <View style={styles.summaryMetricItem}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Active Days</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {deliveredOrPlannedDays} days
              </Text>
            </View>

            <View style={styles.summaryMetricItem}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Skipped Days</Text>
              <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                {skippedDays} days
              </Text>
            </View>
          </View>

          <View style={styles.estCostRow}>
            <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '500' }}>
              Estimated Bill @ ₹{defaultPlan.unitPrice}/L:
            </Text>
            <Text style={{ fontSize: 18, color: colors.primary, fontWeight: '800' }}>
              {formatCurrency(totalLitres * defaultPlan.unitPrice)}
            </Text>
          </View>
        </Card>
      </ScrollView>

      {/* Day Override Modal */}
      {selectedDay && (
        <BottomSheetModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          title={`Delivery for ${format(selectedDay, 'EEEE, dd MMMM')}`}
          subtitle="Modifications will reflect directly in the vendor delivery route"
        >
          <View style={styles.modalBody}>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              Choose quantity for this specific day:
            </Text>

            <View style={styles.stepperContainer}>
              <QuantityStepper
                value={modalQty}
                onChange={setModalQty}
                step={0.5}
                min={0}
                max={10}
                size="lg"
              />
            </View>

            {/* Presets */}
            <View style={styles.modalPresets}>
              <TouchableOpacity
                onPress={() => setModalQty(0)}
                style={[
                  styles.presetOption,
                  modalQty === 0 && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
                ]}
              >
                <Text style={[styles.presetTitle, modalQty === 0 && { color: '#EF4444' }]}>
                  Skip (0L)
                </Text>
                <Text style={styles.presetDesc}>No milk delivery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setModalQty(defaultPlan.quantity)}
                style={[
                  styles.presetOption,
                  modalQty === defaultPlan.quantity && {
                    backgroundColor: '#ECFDF5',
                    borderColor: '#10B981',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.presetTitle,
                    modalQty === defaultPlan.quantity && { color: '#10B981' },
                  ]}
                >
                  Default ({defaultPlan.quantity}L)
                </Text>
                <Text style={styles.presetDesc}>Normal daily plan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setModalQty(defaultPlan.quantity * 2)}
                style={[
                  styles.presetOption,
                  modalQty === defaultPlan.quantity * 2 && {
                    backgroundColor: '#EFF6FF',
                    borderColor: '#3B82F6',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.presetTitle,
                    modalQty === defaultPlan.quantity * 2 && { color: '#3B82F6' },
                  ]}
                >
                  Double ({defaultPlan.quantity * 2}L)
                </Text>
                <Text style={styles.presetDesc}>Guests / festival</Text>
              </TouchableOpacity>
            </View>

            <Button
              title={`Save ${modalQty === 0 ? 'Skip' : `${modalQty} Litres`}`}
              variant="primary"
              onPress={handleSaveOverride}
              style={{ marginTop: 24 }}
            />
          </View>
        </BottomSheetModal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 20,
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  weekHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    width: '14%',
    textAlign: 'center',
  },
  calendarCard: {
    padding: 12,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  cellDayNum: {
    fontSize: 14,
  },
  qtyIndicator: {
    marginTop: 2,
  },
  skipTag: {
    fontSize: 9,
    fontWeight: '800',
  },
  qtyTag: {
    fontSize: 10,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
  },
  summaryCard: {
    padding: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  summaryMetricItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  estCostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  modalBody: {
    paddingVertical: 8,
  },
  modalHint: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  stepperContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalPresets: {
    gap: 8,
  },
  presetOption: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  presetDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});

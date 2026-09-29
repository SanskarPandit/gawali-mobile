import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addDays } from 'date-fns';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Card, Badge, Button, CalendarStrip, BottomSheetModal, QuantityStepper } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { setDayOverride, resetDayOverride } from '../../app/store/subscriptionSlice';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';
import { isCutoffPassed } from '../../shared/utils/cutoff';

export const CustomerHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { defaultPlan, overrides, cutoffTimeStr } = useAppSelector((state) => state.subscription);
  const { bills } = useAppSelector((state) => state.billing);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [modalVisible, setModalVisible] = useState(false);
  const [modalDate, setModalDate] = useState<Date>(addDays(new Date(), 1));
  const [modalQty, setModalQty] = useState<number>(defaultPlan.quantity);

  const tomorrow = addDays(new Date(), 1);
  const tomorrowKey = format(tomorrow, 'yyyy-MM-dd');
  const tomorrowOverride = overrides[tomorrowKey];
  const tomorrowQty = tomorrowOverride ? tomorrowOverride.quantity : defaultPlan.quantity;
  const tomorrowIsCutoff = isCutoffPassed(tomorrow, cutoffTimeStr);

  const unpaidBill = bills.find((b) => b.status === 'unpaid' || b.status === 'overdue');

  const openOverrideModalForDate = (date: Date) => {
    const key = format(date, 'yyyy-MM-dd');
    const existing = overrides[key];
    setModalDate(date);
    setModalQty(existing ? existing.quantity : defaultPlan.quantity);
    setModalVisible(true);
  };

  const handleSaveModalOverride = () => {
    const dateStr = format(modalDate, 'yyyy-MM-dd');
    dispatch(
      setDayOverride({
        date: dateStr,
        quantity: modalQty,
      })
    );
    setModalVisible(false);
  };

  const handleQuickSkipTomorrow = () => {
    dispatch(
      setDayOverride({
        date: tomorrowKey,
        quantity: 0.0,
        note: 'Customer skipped via 1-tap',
      })
    );
  };

  const handleQuickAdd1LTomorrow = () => {
    dispatch(
      setDayOverride({
        date: tomorrowKey,
        quantity: tomorrowQty + 1.0,
      })
    );
  };

  const handleResetTomorrow = () => {
    dispatch(resetDayOverride(tomorrowKey));
  };

  const handleContactWhatsApp = () => {
    Linking.openURL('https://wa.me/919876543211?text=Hi%20Badhale%20Dairy,%20I%20have%20a%20question%20regarding%20my%20milk%20delivery.');
  };

  const handleCallDairy = () => {
    Linking.openURL('tel:+919876543211');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top App Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top + 8, 16),
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>
            Good morning,
          </Text>
          <Text style={[styles.userName, { color: colors.textPrimary }]}>
            {user?.fullName || 'Rahul Patil'} 👋
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('CustomerProfile')}
          style={[styles.profileAvatar, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.avatarLetter}>
            {(user?.fullName || 'R').charAt(0)}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Unpaid Bill Notice Alert if any */}
        {unpaidBill && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CustomerBills')}
            style={[styles.billAlertBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: '#92400E', fontSize: 13 }}>
                ⚠️ {unpaidBill.month} Bill Pending: {formatCurrency(unpaidBill.netPayable)}
              </Text>
              <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                Due on {unpaidBill.dueDate} • Tap to pay via UPI
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E' }}>Pay ›</Text>
          </TouchableOpacity>
        )}

        {/* Today's Delivery Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Today • {format(new Date(), 'dd MMMM yyyy')}
              </Text>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {defaultPlan.productName}
              </Text>
            </View>
            <Badge label="Delivered" variant="success" />
          </View>

          <View style={styles.deliveryDetails}>
            <View style={styles.detailMetric}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Delivered Qty</Text>
              <Text style={[styles.metricValue, { color: colors.primary }]}>
                {formatLitres(defaultPlan.quantity)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailMetric}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Delivered At</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>06:15 AM</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailMetric}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Dairy</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>Badhale</Text>
            </View>
          </View>

          <View style={[styles.statusBanner, { backgroundColor: isDark ? colors.surface : '#F0FDF4' }]}>
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
              ✓ Dropped in milk bag at your door (Handled by Suresh)
            </Text>
          </View>
        </Card>

        {/* Tomorrow's Plan & Smart Fast Actions */}
        <Card style={styles.tomorrowCard}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Tomorrow • {format(tomorrow, 'EEEE, dd MMM')}
              </Text>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Planned: {formatLitres(tomorrowQty)}
              </Text>
            </View>
            <Badge
              label={tomorrowQty === 0 ? 'Skipped' : tomorrowOverride ? 'Modified' : 'Scheduled'}
              variant={tomorrowQty === 0 ? 'error' : tomorrowOverride ? 'warning' : 'emerald'}
            />
          </View>

          <View style={styles.cutoffRow}>
            <Text style={[styles.cutoffNotice, { color: colors.textSecondary }]}>
              ⏰ Modify until {cutoffTimeStr.slice(0, 5)} PM tonight
            </Text>
          </View>

          {/* Quick 1-tap Action Pills */}
          <View style={styles.quickActionPills}>
            {tomorrowQty > 0 ? (
              <Button
                title="Skip Tomorrow (0L)"
                variant="outline"
                size="sm"
                onPress={handleQuickSkipTomorrow}
                style={{ flex: 1, borderColor: '#EF4444' }}
                textStyle={{ color: '#EF4444' }}
              />
            ) : (
              <Button
                title="Resume Delivery (1.5L)"
                variant="outline"
                size="sm"
                onPress={handleResetTomorrow}
                style={{ flex: 1 }}
              />
            )}

            <Button
              title="+ 1L Extra"
              variant="outline"
              size="sm"
              onPress={handleQuickAdd1LTomorrow}
              style={{ flex: 1 }}
            />

            <Button
              title="Custom Qty"
              variant="primary"
              size="sm"
              onPress={() => openOverrideModalForDate(tomorrow)}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* 14-Day Calendar Strip */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Daily Delivery Calendar
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('CustomerCalendar')}>
            <Text style={[styles.sectionLink, { color: colors.primary }]}>View Month ›</Text>
          </TouchableOpacity>
        </View>

        <CalendarStrip
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            openOverrideModalForDate(d);
          }}
          statusMap={overrides}
        />

        {/* Monthly Estimate & Subscription Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.smallStatCard}>
            <Text style={[styles.smallStatLabel, { color: colors.textSecondary }]}>Monthly Est.</Text>
            <Text style={[styles.smallStatVal, { color: colors.textPrimary }]}>
              {formatCurrency(defaultPlan.quantity * 30 * defaultPlan.unitPrice)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted }}>30 days @ ₹{defaultPlan.unitPrice}/L</Text>
          </Card>

          <Card style={styles.smallStatCard}>
            <Text style={[styles.smallStatLabel, { color: colors.textSecondary }]}>Rate Locked</Text>
            <Text style={[styles.smallStatVal, { color: colors.primary }]}>
              ₹{defaultPlan.unitPrice} <Text style={{ fontSize: 14 }}>/L</Text>
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted }}>A2 Gir Cow Milk</Text>
          </Card>
        </View>

        {/* Direct Dairy Support Card */}
        <Card style={styles.dairySupportCard} variant="outlined">
          <View style={styles.dairySupportHeader}>
            <View>
              <Text style={[styles.vendorLabel, { color: colors.textMuted }]}>Your Milk Vendor</Text>
              <Text style={[styles.vendorName, { color: colors.textPrimary }]}>
                Badhale Dairy & Farm
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Owner: Shailesh Badhale • Baner, Pune
              </Text>
            </View>
          </View>

          <View style={styles.dairyContactBtns}>
            <Button
              title="💬 WhatsApp Vendor"
              variant="outline"
              size="sm"
              onPress={handleContactWhatsApp}
              style={{ flex: 1 }}
            />
            <Button
              title="📞 Call Vendor"
              variant="outline"
              size="sm"
              onPress={handleCallDairy}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      </ScrollView>

      {/* Override Bottom Sheet Modal */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`Delivery for ${format(modalDate, 'dd MMMM yyyy')}`}
        subtitle={`Default daily quota is ${formatLitres(defaultPlan.quantity)}`}
      >
        <View style={styles.modalContent}>
          <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>
            Select quantity for this date:
          </Text>

          <View style={styles.stepperCenter}>
            <QuantityStepper
              value={modalQty}
              onChange={setModalQty}
              step={0.5}
              min={0}
              max={10}
              size="lg"
            />
          </View>

          {/* Quick preset buttons */}
          <View style={styles.presetButtonsRow}>
            <TouchableOpacity
              onPress={() => setModalQty(0)}
              style={[
                styles.presetBtn,
                modalQty === 0 && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
              ]}
            >
              <Text style={[styles.presetText, modalQty === 0 && { color: '#EF4444', fontWeight: '700' }]}>
                Skip (0L)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setModalQty(defaultPlan.quantity)}
              style={[
                styles.presetBtn,
                modalQty === defaultPlan.quantity && {
                  backgroundColor: '#ECFDF5',
                  borderColor: '#10B981',
                },
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  modalQty === defaultPlan.quantity && { color: '#10B981', fontWeight: '700' },
                ]}
              >
                Default ({defaultPlan.quantity}L)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setModalQty(defaultPlan.quantity * 2)}
              style={[
                styles.presetBtn,
                modalQty === defaultPlan.quantity * 2 && {
                  backgroundColor: '#EFF6FF',
                  borderColor: '#3B82F6',
                },
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  modalQty === defaultPlan.quantity * 2 && { color: '#3B82F6', fontWeight: '700' },
                ]}
              >
                Double ({defaultPlan.quantity * 2}L)
              </Text>
            </TouchableOpacity>
          </View>

          <Button
            title={`Confirm ${modalQty === 0 ? 'Skip' : `${modalQty} L`} for this date`}
            variant="primary"
            onPress={handleSaveModalOverride}
            style={{ marginTop: 20 }}
          />
        </View>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  greeting: {
    fontSize: 13,
    fontWeight: '500',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  profileAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  billAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  heroCard: {
    padding: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  deliveryDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  detailMetric: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  statusBanner: {
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tomorrowCard: {
    padding: 18,
  },
  cutoffRow: {
    marginTop: 6,
    marginBottom: 14,
  },
  cutoffNotice: {
    fontSize: 12,
    fontWeight: '500',
  },
  quickActionPills: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  smallStatCard: {
    flex: 1,
    padding: 14,
  },
  smallStatLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  smallStatVal: {
    fontSize: 20,
    fontWeight: '700',
    marginVertical: 4,
  },
  dairySupportCard: {
    padding: 16,
    borderRadius: 16,
  },
  dairySupportHeader: {
    marginBottom: 12,
  },
  vendorLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  dairyContactBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  modalContent: {
    paddingVertical: 12,
  },
  modalLabel: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  stepperCenter: {
    alignItems: 'center',
    marginBottom: 20,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
});

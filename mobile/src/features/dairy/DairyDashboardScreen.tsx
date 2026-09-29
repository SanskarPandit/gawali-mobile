import React from 'react';
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
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, StatCard, Badge, Button } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { logout, quickDemoLogin } from '../../app/store/authSlice';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';

export const DairyDashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { routeCustomers } = useAppSelector((state) => state.delivery);

  const totalCustomers = routeCustomers.length;
  const deliveredCount = routeCustomers.filter((c) => c.status === 'delivered').length;
  const skippedCount = routeCustomers.filter((c) => c.status === 'skipped').length;
  const pendingCount = routeCustomers.filter((c) => c.status === 'pending').length;

  const totalTodayLitres = routeCustomers
    .filter((c) => c.status !== 'skipped')
    .reduce((sum, c) => sum + c.quantity, 0);

  const totalOverdueAmount = routeCustomers.reduce((sum, c) => sum + (c.balanceAmount || 0), 0);

  const overdueCustomers = routeCustomers.filter((c) => (c.balanceAmount || 0) > 0);

  const completionPercent = Math.round((deliveredCount / (totalCustomers - skippedCount)) * 100) || 0;

  const handleSendWhatsAppReminder = (customer: any) => {
    const text = encodeURIComponent(
      `Namaskar ${customer.name}, your Gawali milk bill balance of ₹${customer.balanceAmount} with Badhale Dairy is pending. Please pay using the Gawali app or UPI: badhaledairy@upi. Dhanyawad!`
    );
    Linking.openURL(`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}?text=${text}`);
  };

  const handleCallCustomer = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={user?.dairyName || 'Badhale Dairy'}
        subtitle="Vendor Administration Portal"
        rightAction={
          <TouchableOpacity
            onPress={() => dispatch(quickDemoLogin('customer'))}
            style={[styles.switchBadge, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.switchText}>👤 Customer View</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Today's Route Progress Bar Card */}
        <Card style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={[styles.progressSubtitle, { color: colors.textSecondary }]}>
                Today's Morning Delivery Run
              </Text>
              <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>
                {deliveredCount} of {totalCustomers - skippedCount} Delivered ({completionPercent}%)
              </Text>
            </View>
            <Badge
              label={pendingCount === 0 ? 'Completed' : 'In Progress'}
              variant={pendingCount === 0 ? 'success' : 'warning'}
            />
          </View>

          {/* Progress Bar Track */}
          <View style={[styles.progressTrack, { backgroundColor: isDark ? colors.surface : '#E2E8F0' }]}>
            <View
              style={[
                styles.progressBar,
                { width: `${completionPercent}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>

          <View style={styles.progressFooter}>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
              🥛 {formatLitres(totalTodayLitres)} total volume today
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('DairyDeliveries')}>
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '700' }}>
                Open Route Checklist ›
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* 4 Primary Business Metric Cards */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricsRow}>
            <StatCard
              title="Today's Litres"
              value={formatLitres(totalTodayLitres)}
              subtitle="Morning shift"
              style={{ marginRight: 8 }}
            />
            <StatCard
              title="Active Customers"
              value={totalCustomers}
              subtitle="2 routes active"
              style={{ marginLeft: 8 }}
            />
          </View>

          <View style={styles.metricsRow}>
            <StatCard
              title="Monthly Earned"
              value="₹84,250"
              subtitle="September 2026"
              trend="+12% MoM"
              style={{ marginRight: 8 }}
            />
            <StatCard
              title="Pending Balance"
              value={formatCurrency(totalOverdueAmount)}
              subtitle={`${overdueCustomers.length} customers`}
              trend="Overdue"
              trendPositive={false}
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>

        {/* Outstanding Payment Reminders Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Pending Payment Collections
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Send 1-tap WhatsApp reminders with UPI link
              </Text>
            </View>
          </View>

          <View style={styles.overdueList}>
            {overdueCustomers.map((cust) => (
              <Card key={cust.id} style={styles.overdueCard} variant="outlined">
                <View style={styles.overdueRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.customerName, { color: colors.textPrimary }]}>
                      {cust.name}
                    </Text>
                    <Text style={[styles.customerFlat, { color: colors.textMuted }]}>
                      {cust.wingFlat} • {cust.address}
                    </Text>
                    <Text style={[styles.balanceTag, { color: colors.error }]}>
                      Pending: {formatCurrency(cust.balanceAmount)}
                    </Text>
                  </View>

                  <View style={styles.reminderActions}>
                    <TouchableOpacity
                      onPress={() => handleSendWhatsAppReminder(cust)}
                      style={[styles.actionBtnWhatsApp]}
                    >
                      <Text style={styles.btnTextWhatsApp}>💬 WhatsApp</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleCallCustomer(cust.phone)}
                      style={[styles.actionBtnCall, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
                    >
                      <Text style={{ fontSize: 13, color: colors.textPrimary }}>📞 Call</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>

        {/* Quick Management Shortcuts */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Quick Actions
          </Text>

          <View style={styles.quickShortcuts}>
            <Button
              title="📋 Route Checklist (Mark Deliveries)"
              variant="primary"
              onPress={() => navigation.navigate('DairyDeliveries')}
            />

            <Button
              title="👥 Customer Directory & Ledger"
              variant="outline"
              onPress={() => navigation.navigate('DairyCustomers')}
            />

            <Button
              title="📊 Monthly Volume & Financial Reports"
              variant="outline"
              onPress={() => navigation.navigate('DairyReports')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 18,
  },
  switchBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  switchText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  progressCard: {
    padding: 16,
    gap: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  progressSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricsGrid: {
    gap: 12,
  },
  metricsRow: {
    flexDirection: 'row',
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  overdueList: {
    gap: 10,
  },
  overdueCard: {
    padding: 14,
  },
  overdueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  customerFlat: {
    fontSize: 12,
    marginTop: 2,
  },
  balanceTag: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  reminderActions: {
    gap: 6,
  },
  actionBtnWhatsApp: {
    backgroundColor: '#25D366',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnTextWhatsApp: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnCall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  quickShortcuts: {
    gap: 10,
    marginTop: 4,
  },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, StatCard, Button } from '../../shared/ui';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';

export const DairyReportsScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const handleExportCSV = (type: string) => {
    Alert.alert(
      'Export Initiated',
      `Generating ${type} CSV report. Backend endpoint: /api/reports/export/?format=csv`
    );
  };

  const handleBroadcastWhatsApp = () => {
    Alert.alert(
      'Broadcast Invoices',
      'This will send WhatsApp invoice links to all 50 registered customers with pending balances. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Broadcast',
          onPress: () =>
            Alert.alert('Broadcast Sent', 'WhatsApp invoices queued and sent via Gawali notification service.'),
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Reports & Analytics"
        subtitle="Volume, billing & collection summaries"
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Summary Card */}
        <Card style={styles.heroCard}>
          <Text style={[styles.monthLabel, { color: colors.textSecondary }]}>
            September 2026 Summary
          </Text>
          <Text style={[styles.totalRev, { color: colors.textPrimary }]}>
            ₹1,24,680
          </Text>
          <Text style={[styles.revSub, { color: colors.textMuted }]}>
            Gross value of milk and fresh dairy products delivered
          </Text>

          <View style={styles.statsStrip}>
            <View style={styles.stripCol}>
              <Text style={[styles.stripLabel, { color: colors.textMuted }]}>Delivered Volume</Text>
              <Text style={[styles.stripVal, { color: colors.primary }]}>{formatLitres(1832)}</Text>
            </View>
            <View style={styles.stripCol}>
              <Text style={[styles.stripLabel, { color: colors.textMuted }]}>Collected</Text>
              <Text style={[styles.stripVal, { color: '#10B981' }]}>₹98,200</Text>
            </View>
            <View style={styles.stripCol}>
              <Text style={[styles.stripLabel, { color: colors.textMuted }]}>Pending</Text>
              <Text style={[styles.stripVal, { color: '#EF4444' }]}>₹26,480</Text>
            </View>
          </View>
        </Card>

        {/* Breakdown by product */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Volume by Product Category
          </Text>

          <View style={styles.breakdownRow}>
            <Text style={{ color: colors.textSecondary }}>Pure Desi Cow Milk (A2)</Text>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>1,120 L (61%)</Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={{ color: colors.textSecondary }}>Rich Buffalo Milk</Text>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>712 L (39%)</Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={{ color: colors.textSecondary }}>Gir Cow Ghee (Bilona)</Text>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>24 Jars (12 Kg)</Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={{ color: colors.textSecondary }}>Artisanal Malai Paneer</Text>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>38 Packs (9.5 Kg)</Text>
          </View>
        </Card>

        {/* Data Export & Operations */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Export Reports & Invoicing
          </Text>

          <Button
            title="📥 Export Delivery Register (CSV)"
            variant="outline"
            onPress={() => handleExportCSV('Delivery Register')}
            style={styles.actionBtn}
          />

          <Button
            title="📥 Export Customer Ledger & Dues (CSV)"
            variant="outline"
            onPress={() => handleExportCSV('Customer Ledger')}
            style={styles.actionBtn}
          />

          <Button
            title="📢 Broadcast Invoices to All Overdue Customers"
            variant="primary"
            onPress={handleBroadcastWhatsApp}
            style={styles.actionBtn}
          />
        </Card>
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
    gap: 16,
  },
  heroCard: {
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  monthLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalRev: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  revSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  statsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  stripCol: {
    alignItems: 'center',
    flex: 1,
  },
  stripLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  stripVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionCard: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  actionBtn: {
    marginTop: 4,
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, Badge, Button, Input, BottomSheetModal, QuantityStepper } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { updateCustomerBalance } from '../../app/store/deliverySlice';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';

export const DairyCustomerDetailScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const customerId = route.params?.customerId || 1;

  const customer = useAppSelector((state) =>
    state.delivery.routeCustomers.find((c) => c.id === customerId)
  );

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [cashAmount, setCashAmount] = useState('');

  if (!customer) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Customer Detail" onBack={() => navigation.goBack()} />
        <View style={styles.centerEmpty}>
          <Text style={{ color: colors.textSecondary }}>Customer not found.</Text>
        </View>
      </View>
    );
  }

  const handleRecordCash = () => {
    const amount = parseFloat(cashAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    const newBal = Math.max(0, customer.balanceAmount - amount);
    dispatch(updateCustomerBalance({ customerId: customer.id, newBalance: newBal }));
    setPaymentModalVisible(false);
    setCashAmount('');
    Alert.alert('Payment Recorded', `Received ₹${amount} in cash from ${customer.name}. New balance: ₹${newBal}.`);
  };

  const handleSendStatement = () => {
    const text = encodeURIComponent(
      `Gawali Delivery Statement for ${customer.name}:\nDaily Plan: ${customer.quantity}L ${customer.productName}\nOutstanding Balance: ₹${customer.balanceAmount}\nThank you, Badhale Dairy.`
    );
    Linking.openURL(`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}?text=${text}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={customer.name}
        subtitle={customer.wingFlat}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <View>
              <Text style={[styles.custName, { color: colors.textPrimary }]}>{customer.name}</Text>
              <Text style={[styles.custPhone, { color: colors.textSecondary }]}>{customer.phone}</Text>
              <Text style={[styles.custAddress, { color: colors.textMuted }]}>{customer.address}</Text>
            </View>
            <Badge
              label={customer.balanceAmount > 0 ? 'Overdue' : 'Active'}
              variant={customer.balanceAmount > 0 ? 'error' : 'success'}
            />
          </View>

          <View style={styles.balanceHighlight}>
            <Text style={[styles.balLabel, { color: colors.textMuted }]}>Outstanding Balance</Text>
            <Text
              style={[
                styles.balVal,
                { color: customer.balanceAmount > 0 ? colors.error : colors.primary },
              ]}
            >
              {formatCurrency(customer.balanceAmount)}
            </Text>
          </View>

          <View style={styles.contactRow}>
            <Button
              title="💬 WhatsApp"
              variant="outline"
              size="sm"
              onPress={handleSendStatement}
              style={{ flex: 1 }}
            />
            <Button
              title="📞 Call"
              variant="outline"
              size="sm"
              onPress={() => Linking.openURL(`tel:${customer.phone}`)}
              style={{ flex: 1 }}
            />
            <Button
              title="💵 Record Cash"
              variant="primary"
              size="sm"
              onPress={() => setPaymentModalVisible(true)}
              style={{ flex: 1.2 }}
            />
          </View>
        </Card>

        {/* Subscription Plan Details */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Milk Subscription Details
          </Text>

          <View style={styles.infoRow}>
            <Text style={{ color: colors.textSecondary }}>Assigned Product</Text>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{customer.productName}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={{ color: colors.textSecondary }}>Daily Quota</Text>
            <Text style={{ fontWeight: '700', color: colors.primary }}>{formatLitres(customer.quantity)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={{ color: colors.textSecondary }}>Delivery Sequence</Text>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Stop #{customer.sequenceOrder}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={{ color: colors.textSecondary }}>Instructions</Text>
            <Text style={{ fontWeight: '500', color: colors.textSecondary, flex: 1, textAlign: 'right' }}>
              {customer.specialInstructions || 'None'}
            </Text>
          </View>
        </Card>

        {/* Recent Deliveries Checklist */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Recent Delivery Logs
          </Text>

          <View style={styles.historyItem}>
            <View>
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Today (25 Sep)</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Delivered at 06:15 AM</Text>
            </View>
            <Badge label="Delivered" variant="success" size="sm" />
          </View>

          <View style={styles.historyItem}>
            <View>
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Yesterday (24 Sep)</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Delivered at 06:20 AM</Text>
            </View>
            <Badge label="Delivered" variant="success" size="sm" />
          </View>

          <View style={styles.historyItem}>
            <View>
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>23 Sep 2026</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Customer skipped</Text>
            </View>
            <Badge label="Skipped" variant="error" size="sm" />
          </View>
        </Card>
      </ScrollView>

      {/* Record Cash Bottom Sheet Modal */}
      <BottomSheetModal
        visible={paymentModalVisible}
        onClose={() => setPaymentModalVisible(false)}
        title="Record Cash Payment"
        subtitle={`Settle balance for ${customer.name}`}
      >
        <View style={{ paddingVertical: 12 }}>
          <Input
            label="Cash Amount Received (₹)"
            placeholder="e.g. 1000"
            keyboardType="numeric"
            value={cashAmount}
            onChangeText={setCashAmount}
          />

          <Button
            title="Confirm Cash Received"
            variant="primary"
            onPress={handleRecordCash}
            style={{ marginTop: 16 }}
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
  centerEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  profileCard: {
    padding: 18,
    gap: 14,
  },
  profileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  custName: {
    fontSize: 20,
    fontWeight: '800',
  },
  custPhone: {
    fontSize: 13,
    marginTop: 2,
  },
  custAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  balanceHighlight: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
    alignItems: 'center',
  },
  balLabel: {
    fontSize: 12,
  },
  balVal: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionCard: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
  },
});

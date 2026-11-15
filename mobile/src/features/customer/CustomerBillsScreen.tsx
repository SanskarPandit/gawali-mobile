import React, { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { ChevronRight, IndianRupee, ReceiptText } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Badge, BottomSheetModal, Button, Card, EmptyState, Header, LoadState, StaleBanner, usePullToRefresh } from '../../shared/ui';
import { useGetCustomerDashboardQuery, useGetMyBillsQuery } from '../../shared/api/gawaliApi';
import { Bill, BillStatus, toNumber } from '../../shared/api/types';
import { formatCurrency, formatQuantity } from '../../shared/utils/formatters';

const STATUS: Record<BillStatus, { key: string; fallback: string; variant: 'success' | 'warning' | 'error' | 'info' }> = {
  paid: { key: 'bills.paid', fallback: 'Paid', variant: 'success' },
  partially_paid: { key: 'bills.partial', fallback: 'Part paid', variant: 'warning' },
  generated: { key: 'bills.due', fallback: 'Due', variant: 'info' },
  overdue: { key: 'bills.overdue', fallback: 'Overdue', variant: 'error' },
};

export const CustomerBillsScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const bills = useGetMyBillsQuery();
  const dashboard = useGetCustomerDashboardQuery();
  const refreshControl = usePullToRefresh(bills.refetch);
  const [open, setOpen] = useState<Bill | null>(null);

  const upiId = dashboard.data?.dairy?.upi_id;
  const dairyName = dashboard.data?.dairy?.name ?? '';

  const payByUpi = async (bill: Bill) => {
    if (!upiId) {
      Alert.alert(t('bills.no_upi', 'UPI not set up'), t('bills.no_upi_body', 'Your dairy has not added a UPI ID yet. Please pay them directly.'));
      return;
    }
    const params: Record<string, string> = {
      pa: upiId,
      pn: dairyName,
      am: toNumber(bill.due_amount).toFixed(2),
      cu: 'INR',
      tn: `Gawali ${bill.month_name}`,
    };
    const query = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const url = `upi://pay?${query}`;
    try {
      await Linking.openURL(url);
      Alert.alert(
        t('bills.after_pay', 'After paying'),
        t('bills.after_pay_body', 'Your dairy marks the bill as paid once they receive the money. It can take a few hours to show here.')
      );
    } catch {
      Alert.alert(t('bills.no_upi_app', 'No UPI app found'), t('bills.no_upi_app_body', 'Install a UPI app such as GPay, PhonePe or Paytm, or pay to {{upi}}.', { upi: upiId }));
    }
  };

  const summary = bills.data?.summary;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={t('bills.title', 'Bills')} subtitle={t('bills.subtitle', 'Monthly statements from your dairy')} />

      <LoadState isLoading={bills.isLoading} error={bills.error} hasData={!!bills.data} onRetry={bills.refetch}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} refreshControl={refreshControl}>
          <StaleBanner error={bills.error} />

          {summary && (
            <Card style={styles.summary}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('bills.total_due', 'Total due')}</Text>
              <Text style={[styles.dueValue, { color: summary.total_due > 0 ? '#DC2626' : colors.primary }]}>{formatCurrency(summary.total_due)}</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  {t('bills.billed', 'Billed')} {formatCurrency(summary.total_billed)}
                </Text>
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  {t('bills.paid_total', 'Paid')} {formatCurrency(summary.total_paid)}
                </Text>
              </View>
            </Card>
          )}

          {(bills.data?.bills ?? []).length === 0 ? (
            <EmptyState
              icon={<ReceiptText size={36} color={colors.textMuted} />}
              title={t('bills.empty', 'No bills yet')}
              body={t('bills.empty_body', 'Your first bill is created at the start of next month.')}
            />
          ) : (
            bills.data!.bills.map((bill) => {
              const s = STATUS[bill.status];
              const due = toNumber(bill.due_amount);
              return (
                <Card key={bill.id} style={styles.bill} onPress={() => setOpen(bill)}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.month, { color: colors.textPrimary }]}>{bill.month_name}</Text>
                      <Text style={[styles.muted, { color: colors.textSecondary }]}>
                        {formatQuantity(bill.total_quantity, 'L')} · {formatCurrency(bill.total_amount)}
                      </Text>
                    </View>
                    <Badge label={t(s.key, s.fallback)} variant={s.variant} />
                    <ChevronRight size={18} color={colors.textMuted} />
                  </View>
                  {due > 0 && (
                    <View style={styles.rowBetween}>
                      <Text style={[styles.dueLine, { color: '#DC2626' }]}>
                        {t('bills.due_amount', '{{amount}} due', { amount: formatCurrency(due) })}
                        {bill.due_date ? ` · ${t('bills.by', 'by')} ${format(parseISO(bill.due_date), 'd MMM')}` : ''}
                      </Text>
                      <Button title={t('bills.pay', 'Pay via UPI')} icon={<IndianRupee size={14} color="#FFFFFF" />} size="sm" onPress={() => payByUpi(bill)} />
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </ScrollView>
      </LoadState>

      <BottomSheetModal
        visible={!!open}
        onClose={() => setOpen(null)}
        title={open?.month_name ?? ''}
        subtitle={open ? `${open.dairy_name} · ${formatCurrency(open.total_amount)}` : undefined}
      >
        <ScrollView style={{ maxHeight: 420 }}>
          {open?.items.length ? (
            open.items.map((item) => (
              <View key={item.id} style={[styles.itemRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.textPrimary }]}>{item.item_name}</Text>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>
                    {format(parseISO(item.date), 'd MMM')} · {toNumber(item.quantity)} × {formatCurrency(item.unit_price)}
                  </Text>
                </View>
                <Text style={[styles.itemAmount, { color: colors.textPrimary }]}>{formatCurrency(item.total_amount)}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.muted, { color: colors.textMuted }]}>{t('bills.no_items', 'No line items on this bill.')}</Text>
          )}
          {open && (
            <View style={styles.totals}>
              <View style={styles.rowBetween}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('bills.paid_total', 'Paid')}</Text>
                <Text style={[styles.itemAmount, { color: colors.textPrimary }]}>{formatCurrency(open.paid_amount)}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('bills.balance', 'Balance')}</Text>
                <Text style={[styles.itemAmount, { color: toNumber(open.due_amount) > 0 ? '#DC2626' : colors.primary }]}>{formatCurrency(open.due_amount)}</Text>
              </View>
              {toNumber(open.due_amount) > 0 && <Button title={t('bills.pay', 'Pay via UPI')} onPress={() => payByUpi(open)} />}
            </View>
          )}
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 12 },
  summary: { padding: 18, gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  dueValue: { fontSize: 28, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  muted: { fontSize: 12 },
  bill: { padding: 16, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  month: { fontSize: 16, fontWeight: '700' },
  dueLine: { fontSize: 13, fontWeight: '700', flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemName: { fontSize: 14, fontWeight: '600' },
  itemAmount: { fontSize: 14, fontWeight: '700' },
  totals: { gap: 10, paddingTop: 12 },
});

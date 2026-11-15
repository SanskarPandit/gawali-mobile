import React, { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { Share2 } from 'lucide-react-native';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Button, Card, Header, LoadState, StaleBanner, StatCard, usePullToRefresh } from '../../shared/ui';
import { errorMessage } from '../../shared/ui/QueryStates';
import { useGetReportsQuery } from '../../shared/api/gawaliApi';
import { apiClient } from '../../shared/api/apiClient';
import { useAppSelector } from '../../app/store';
import type { DairyReport, ReportPreset } from '../../shared/api/types';
import { formatCurrency, formatLitres, formatQuantity } from '../../shared/utils/formatters';

const PRESETS: { key: ReportPreset; label: string; fallback: string }[] = [
  { key: 'this_month', label: 'reports.this_month', fallback: 'This month' },
  { key: 'last_month', label: 'reports.last_month', fallback: 'Last month' },
  { key: 'last_7d', label: 'reports.last_7d', fallback: '7 days' },
  { key: 'last_30d', label: 'reports.last_30d', fallback: '30 days' },
];

const toCsv = (r: DairyReport) =>
  ['Date,Litres,Amount', ...r.daily_breakdown.map((d) => `${d.date},${d.quantity.toFixed(2)},${d.amount.toFixed(2)}`)].join('\n');

export const DairyReportsScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [preset, setPreset] = useState<ReportPreset>('this_month');
  const report = useGetReportsQuery(preset);
  const isDemo = useAppSelector((s) => s.auth.sessionMode === 'demo');
  const refreshControl = usePullToRefresh(report.refetch);
  const [exporting, setExporting] = useState(false);
  const r = report.data;

  const exportCsv = async () => {
    if (!r) return;
    setExporting(true);
    try {
      const csv = isDemo
        ? toCsv(r)
        : (await apiClient.get<string>('/reports/vendor/csv/', { params: { preset }, responseType: 'text' })).data;
      await Share.share({ title: `Gawali report ${r.from} to ${r.to}`, message: csv });
    } catch (e) {
      Alert.alert(t('reports.export_failed', 'Could not export'), errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const maxDay = Math.max(1, ...(r?.daily_breakdown ?? []).map((d) => d.quantity));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('reports.title', 'Reports')}
        subtitle={r ? `${format(parseISO(r.from), 'd MMM')} – ${format(parseISO(r.to), 'd MMM yyyy')}` : undefined}
        rightAction={<Button title={t('reports.export', 'Export')} icon={<Share2 size={14} color={colors.primary} />} variant="outline" size="sm" onPress={exportCsv} loading={exporting} disabled={!r} />}
      />
      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const active = preset === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPreset(p.key)}
              style={[styles.chip, { backgroundColor: active ? colors.primary : isDark ? colors.surface : 'rgba(0,0,0,0.05)' }]}
            >
              <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{t(p.label, p.fallback)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <LoadState isLoading={report.isFetching && !r} error={report.error} hasData={!!r} onRetry={report.refetch}>
        {r && (
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} refreshControl={refreshControl}>
            <StaleBanner error={report.error} />
            <View style={styles.statRow}>
              <StatCard title={t('reports.delivered', 'Milk delivered')} value={formatLitres(r.summary.delivered_litres)} style={{ marginRight: 8 }} />
              <StatCard title={t('reports.revenue', 'Revenue earned')} value={formatCurrency(r.summary.revenue_earned)} style={{ marginLeft: 8 }} />
            </View>
            <View style={styles.statRow}>
              <StatCard title={t('reports.billed', 'Billed')} value={formatCurrency(r.summary.total_billed)} style={{ marginRight: 8 }} />
              <StatCard
                title={t('reports.collected', 'Collected')}
                value={formatCurrency(r.summary.total_collected)}
                subtitle={
                  r.summary.total_billed > 0
                    ? t('reports.collection_rate', '{{pct}}% of billed', { pct: Math.round((r.summary.total_collected / r.summary.total_billed) * 100) })
                    : undefined
                }
                style={{ marginLeft: 8 }}
              />
            </View>

            {r.by_product.length > 0 && (
              <Card style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('reports.by_product', 'By product')}</Text>
                {r.by_product.map((p) => (
                  <View key={p.name} style={[styles.row, { borderColor: colors.border }]}>
                    <Text style={[styles.rowName, { color: colors.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.muted, { color: colors.textSecondary }]}>{formatQuantity(p.quantity, p.unit)}</Text>
                    <Text style={[styles.amount, { color: colors.textPrimary }]}>{formatCurrency(p.amount)}</Text>
                  </View>
                ))}
              </Card>
            )}

            {r.top_customers.length > 0 && (
              <Card style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('reports.top', 'Top households')}</Text>
                {r.top_customers.map((c, i) => (
                  <View key={c.customer_id} style={[styles.row, { borderColor: colors.border }]}>
                    <Text style={[styles.rank, { color: colors.primary }]}>{i + 1}</Text>
                    <Text style={[styles.rowName, { color: colors.textPrimary }]}>{c.name}</Text>
                    <Text style={[styles.amount, { color: colors.textPrimary }]}>{formatCurrency(c.amount)}</Text>
                  </View>
                ))}
              </Card>
            )}

            <Card style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('reports.daily', 'Day by day')}</Text>
              {r.daily_breakdown.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>{t('reports.no_days', 'No deliveries in this period.')}</Text>
              ) : (
                r.daily_breakdown.map((d) => (
                  <View key={d.date} style={styles.barRow}>
                    <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{format(parseISO(d.date), 'd MMM')}</Text>
                    <View style={[styles.barTrack, { backgroundColor: isDark ? colors.surface : '#E2E8F0' }]}>
                      <View style={[styles.barFill, { width: `${(d.quantity / maxDay) * 100}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.barValue, { color: colors.textPrimary }]}>{formatLitres(d.quantity)}</Text>
                  </View>
                ))
              )}
            </Card>
          </ScrollView>
        )}
      </LoadState>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  presets: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipText: { fontSize: 12, fontWeight: '600' },
  scroll: { padding: 16, gap: 12 },
  statRow: { flexDirection: 'row' },
  section: { padding: 16, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600' },
  rank: { width: 18, fontWeight: '800' },
  amount: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 52, fontSize: 12 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  barValue: { width: 56, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});

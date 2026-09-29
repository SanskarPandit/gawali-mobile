import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, Badge, Button } from '../../shared/ui';
import { useAppSelector } from '../../app/store';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';

export const DairyCustomersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { routeCustomers } = useAppSelector((state) => state.delivery);

  const [search, setSearch] = useState('');
  const [filterPendingOnly, setFilterPendingOnly] = useState(false);

  const filtered = routeCustomers.filter((c) => {
    if (filterPendingOnly && (c.balanceAmount || 0) <= 0) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.wingFlat.toLowerCase().includes(q) ||
        c.phone.includes(q)
      );
    }
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Customer Directory"
        subtitle={`${routeCustomers.length} registered subscribers`}
      />

      {/* Search and Filters */}
      <View style={[styles.searchBar, { borderBottomColor: colors.border }]}>
        <View
          style={[
            styles.searchInputWrapper,
            {
              backgroundColor: isDark ? colors.surface : '#FFFFFF',
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ marginRight: 8 }}>🔍</Text>
          <TextInput
            placeholder="Search by customer name, flat, phone..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </View>

        <TouchableOpacity
          onPress={() => setFilterPendingOnly(!filterPendingOnly)}
          style={[
            styles.filterPill,
            filterPendingOnly && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              filterPendingOnly && { color: '#EF4444', fontWeight: '700' },
            ]}
          >
            {filterPendingOnly ? 'Showing Overdue Only' : 'Filter Pending Balances'}
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
        {filtered.map((cust) => {
          const hasBalance = cust.balanceAmount > 0;

          return (
            <Card
              key={cust.id}
              style={styles.customerCard}
              onPress={() => navigation.navigate('DairyCustomerDetail', { customerId: cust.id })}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customerName, { color: colors.textPrimary }]}>
                    {cust.name}
                  </Text>
                  <Text style={[styles.customerAddress, { color: colors.textSecondary }]}>
                    {cust.wingFlat} • {cust.address}
                  </Text>
                </View>
                <Badge
                  label={hasBalance ? 'Pending' : 'Settled'}
                  variant={hasBalance ? 'warning' : 'success'}
                />
              </View>

              <View style={styles.detailsRow}>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Subscription</Text>
                  <Text style={[styles.fieldVal, { color: colors.textPrimary }]}>
                    {formatLitres(cust.quantity)} / day ({cust.productName})
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Balance</Text>
                  <Text
                    style={[
                      styles.fieldVal,
                      { color: hasBalance ? colors.error : colors.primary, fontWeight: '800' },
                    ]}
                  >
                    {formatCurrency(cust.balanceAmount)}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignSelf: 'flex-start',
  },
  filterPillText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  customerCard: {
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  customerAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  fieldLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  fieldVal: {
    fontSize: 13,
    fontWeight: '600',
  },
});

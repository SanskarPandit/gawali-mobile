import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, Badge, Button } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { updateDeliveryStatus, setActiveShift } from '../../app/store/deliverySlice';
import { formatLitres } from '../../shared/utils/formatters';

export const DairyDeliveriesScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { routeCustomers, activeShift } = useAppSelector((state) => state.delivery);

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'delivered' | 'skipped'>('all');
  const [searchText, setSearchText] = useState('');

  const filteredCustomers = routeCustomers.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (searchText.trim() !== '') {
      const q = searchText.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.wingFlat.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const deliveredCount = routeCustomers.filter((c) => c.status === 'delivered').length;
  const totalCount = routeCustomers.length;

  const handleOpenMaps = (lat: number, lng: number) => {
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Delivery Checklist"
        subtitle={`Route Sequence • ${format(new Date(), 'dd MMMM yyyy')}`}
      />

      {/* Shift Switcher & Search Bar */}
      <View style={[styles.controlBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.shiftSelector}>
          <TouchableOpacity
            onPress={() => dispatch(setActiveShift('morning'))}
            style={[
              styles.shiftBtn,
              activeShift === 'morning' && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.shiftText,
                { color: activeShift === 'morning' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              🌅 Morning Run (05:00 - 07:30)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => dispatch(setActiveShift('evening'))}
            style={[
              styles.shiftBtn,
              activeShift === 'evening' && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.shiftText,
                { color: activeShift === 'evening' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              🌆 Evening Run
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: isDark ? colors.surface : '#FFFFFF',
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ marginRight: 8 }}>🔍</Text>
          <TextInput
            placeholder="Search flat, wing or customer name..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={{ color: colors.textMuted }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {(['all', 'pending', 'delivered', 'skipped'] as const).map((st) => (
            <TouchableOpacity
              key={st}
              onPress={() => setFilterStatus(st)}
              style={[
                styles.chip,
                filterStatus === st && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: filterStatus === st ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                {st === 'all'
                  ? `All (${totalCount})`
                  : st === 'pending'
                  ? 'Pending'
                  : st === 'delivered'
                  ? `Delivered (${deliveredCount})`
                  : 'Skipped'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Customer Route Checklist */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filteredCustomers.map((c) => {
          const isDelivered = c.status === 'delivered';
          const isSkipped = c.status === 'skipped';

          return (
            <Card
              key={c.id}
              style={[
                styles.customerCard,
                isDelivered && {
                  borderColor: isDark ? 'rgba(14, 163, 113, 0.4)' : '#A7F3D0',
                  borderWidth: 1,
                },
              ]}
            >
              {/* Row 1: Sequence #, Flat, Name, Status */}
              <View style={styles.cardTopRow}>
                <View style={styles.flatSequenceRow}>
                  <View style={[styles.sequenceBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.sequenceText}>#{c.sequenceOrder}</Text>
                  </View>
                  <View>
                    <Text style={[styles.wingFlat, { color: colors.textPrimary }]}>
                      {c.wingFlat}
                    </Text>
                    <Text style={[styles.customerName, { color: colors.textSecondary }]}>
                      {c.name}
                    </Text>
                  </View>
                </View>

                <Badge
                  label={c.status.toUpperCase()}
                  variant={isDelivered ? 'success' : isSkipped ? 'error' : 'warning'}
                />
              </View>

              {/* Product and Qty */}
              <View style={styles.productRow}>
                <View>
                  <Text style={[styles.productName, { color: colors.textPrimary }]}>
                    {c.productName}
                  </Text>
                  <Text style={[styles.addressLine, { color: colors.textMuted }]}>
                    {c.address}
                  </Text>
                </View>
                <Text style={[styles.quantityValue, { color: isSkipped ? colors.textMuted : colors.primary }]}>
                  {isSkipped ? '0 L (Skipped)' : formatLitres(c.quantity)}
                </Text>
              </View>

              {/* Special instruction notes */}
              {c.specialInstructions && (
                <View style={[styles.notesBox, { backgroundColor: isDark ? colors.surface : '#FFFBEB' }]}>
                  <Text style={styles.notesText}>
                    📝 {c.specialInstructions}
                  </Text>
                </View>
              )}

              {/* Action Buttons: Toggle Delivered, Skipped, Navigation */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={() => handleOpenMaps(c.latitude, c.longitude)}
                  style={[styles.iconActionBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
                >
                  <Text style={{ fontSize: 13, color: colors.textPrimary }}>📍 Map</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleCall(c.phone)}
                  style={[styles.iconActionBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
                >
                  <Text style={{ fontSize: 13, color: colors.textPrimary }}>📞 Call</Text>
                </TouchableOpacity>

                {isDelivered ? (
                  <Button
                    title="✓ Delivered"
                    variant="outline"
                    size="sm"
                    onPress={() =>
                      dispatch(updateDeliveryStatus({ customerId: c.id, status: 'pending' }))
                    }
                    style={{ flex: 1, borderColor: '#10B981' }}
                    textStyle={{ color: '#10B981' }}
                  />
                ) : (
                  <Button
                    title="Mark Delivered"
                    variant="primary"
                    size="sm"
                    onPress={() =>
                      dispatch(updateDeliveryStatus({ customerId: c.id, status: 'delivered' }))
                    }
                    style={{ flex: 1 }}
                  />
                )}
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
  controlBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  shiftSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: 3,
  },
  shiftBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  shiftText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBox: {
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
    paddingVertical: 6,
  },
  filterChips: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  customerCard: {
    padding: 14,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flatSequenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sequenceBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequenceText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  wingFlat: {
    fontSize: 16,
    fontWeight: '800',
  },
  customerName: {
    fontSize: 12,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
  },
  addressLine: {
    fontSize: 12,
    marginTop: 2,
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  notesBox: {
    padding: 8,
    borderRadius: 8,
  },
  notesText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  iconActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
});

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
import { useTheme } from '../../shared/theme/ThemeContext';
import { Header, Card, Badge, Button } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { updateDeliveryStatus } from '../../app/store/deliverySlice';
import { logout, quickDemoLogin } from '../../app/store/authSlice';
import { formatLitres } from '../../shared/utils/formatters';

export const DeliveryRouteScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { routeCustomers } = useAppSelector((state) => state.delivery);

  const pendingStops = routeCustomers.filter((c) => c.status === 'pending');
  const deliveredStops = routeCustomers.filter((c) => c.status === 'delivered');

  const handleOpenNavigation = (lat: number, lng: number) => {
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Delivery Run"
        subtitle={`Partner: ${user?.fullName || 'Suresh Kadam'} • Morning Route`}
        rightAction={
          <TouchableOpacity
            onPress={() => dispatch(quickDemoLogin('dairy'))}
            style={[styles.switchBadge, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.switchText}>🥛 Dairy Admin</Text>
          </TouchableOpacity>
        }
      />

      {/* Progress banner */}
      <View style={[styles.summaryBanner, { backgroundColor: isDark ? colors.surface : '#ECFDF5' }]}>
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
            {deliveredStops.length} of {routeCustomers.length} Stops Finished
          </Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
            {pendingStops.length} stops remaining on this route
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => dispatch(logout())}
          style={[styles.logoutPill, { borderColor: '#EF4444' }]}
        >
          <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {routeCustomers.map((c) => {
          const isDone = c.status === 'delivered';
          const isSkipped = c.status === 'skipped';

          return (
            <Card
              key={c.id}
              style={[
                styles.stopCard,
                isDone && {
                  opacity: 0.7,
                  borderColor: '#10B981',
                  borderWidth: 1,
                },
                isSkipped && {
                  opacity: 0.5,
                  borderColor: '#EF4444',
                  borderWidth: 1,
                },
              ]}
            >
              <View style={styles.stopHeader}>
                <View style={styles.stopIndexBadge}>
                  <Text style={styles.stopIndexText}>Stop #{c.sequenceOrder}</Text>
                </View>

                <Badge
                  label={c.status.toUpperCase()}
                  variant={isDone ? 'success' : isSkipped ? 'error' : 'warning'}
                />
              </View>

              <View style={styles.addressSection}>
                <Text style={[styles.flatNumber, { color: colors.textPrimary }]}>
                  {c.wingFlat}
                </Text>
                <Text style={[styles.custName, { color: colors.textSecondary }]}>
                  {c.name} • {c.address}
                </Text>
              </View>

              <View style={styles.milkBox}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Order:</Text>
                <Text style={[styles.milkQty, { color: isSkipped ? colors.textMuted : colors.primary }]}>
                  {isSkipped ? '0 L (Customer Skipped)' : `${formatLitres(c.quantity)} of ${c.productName}`}
                </Text>
              </View>

              {c.specialInstructions && (
                <View style={[styles.noteBox, { backgroundColor: isDark ? colors.surface : '#FFFBEB' }]}>
                  <Text style={styles.noteText}>
                    📢 {c.specialInstructions}
                  </Text>
                </View>
              )}

              <View style={styles.btnRow}>
                <TouchableOpacity
                  onPress={() => handleOpenNavigation(c.latitude, c.longitude)}
                  style={[styles.navBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
                >
                  <Text style={{ fontWeight: '700', color: colors.textPrimary }}>📍 Directions</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleCall(c.phone)}
                  style={[styles.navBtn, { backgroundColor: isDark ? colors.surface : '#F1F5F9' }]}
                >
                  <Text style={{ fontWeight: '700', color: colors.textPrimary }}>📞 Call</Text>
                </TouchableOpacity>

                {!isSkipped && (
                  <Button
                    title={isDone ? '✓ Done' : 'Mark Delivered'}
                    variant={isDone ? 'outline' : 'primary'}
                    size="sm"
                    onPress={() =>
                      dispatch(
                        updateDeliveryStatus({
                          customerId: c.id,
                          status: isDone ? 'pending' : 'delivered',
                        })
                      )
                    }
                    style={{ flex: 1.5 }}
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
  summaryBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logoutPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  stopCard: {
    padding: 16,
    gap: 12,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stopIndexBadge: {
    backgroundColor: '#0EA371',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stopIndexText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  addressSection: {
    gap: 2,
  },
  flatNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  custName: {
    fontSize: 13,
  },
  milkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  milkQty: {
    fontSize: 16,
    fontWeight: '700',
  },
  noteBox: {
    padding: 8,
    borderRadius: 8,
  },
  noteText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
});

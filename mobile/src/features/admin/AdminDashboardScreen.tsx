import React, { useState } from 'react';
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
import { Header, Card, StatCard, Badge, Button } from '../../shared/ui';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { quickDemoLogin, logout } from '../../app/store/authSlice';
import { formatCurrency, formatLitres } from '../../shared/utils/formatters';

interface PlatformDairy {
  id: number;
  name: string;
  owner: string;
  phone: string;
  city: string;
  activeSubscribers: number;
  dailyVolume: number;
  status: 'active' | 'pending' | 'suspended';
}

const INITIAL_DAIRIES: PlatformDairy[] = [
  {
    id: 1,
    name: 'Badhale Dairy & Farm',
    owner: 'Shailesh Badhale',
    phone: '+919876543211',
    city: 'Baner, Pune',
    activeSubscribers: 50,
    dailyVolume: 92.5,
    status: 'active',
  },
  {
    id: 2,
    name: 'Katraj Fresh Milk Dairy',
    owner: 'Ramesh Katrajkar',
    phone: '+919876543220',
    city: 'Kothrud, Pune',
    activeSubscribers: 142,
    dailyVolume: 285.0,
    status: 'active',
  },
  {
    id: 3,
    name: 'Shivamrut Organics',
    owner: 'Nitin Pawar',
    phone: '+919876543221',
    city: 'Wakad, Pune',
    activeSubscribers: 88,
    dailyVolume: 164.0,
    status: 'active',
  },
  {
    id: 4,
    name: 'Baramati Cow Milk Center',
    owner: 'Anil Jagtap',
    phone: '+919876543222',
    city: 'Hadapsar, Pune',
    activeSubscribers: 28,
    dailyVolume: 56.0,
    status: 'pending',
  },
];

export const AdminDashboardScreen: React.FC<{ navigation: any }> = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  const [dairies, setDairies] = useState<PlatformDairy[]>(INITIAL_DAIRIES);

  const handleToggleStatus = (dairyId: number) => {
    setDairies((prev) =>
      prev.map((d) => {
        if (d.id === dairyId) {
          const next = d.status === 'active' ? 'suspended' : 'active';
          Alert.alert('Status Updated', `${d.name} status changed to ${next.toUpperCase()}`);
          return { ...d, status: next };
        }
        return d;
      })
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Platform Admin"
        subtitle={`Logged in as ${user?.fullName || 'Mahesh Garade'}`}
        rightAction={
          <TouchableOpacity
            onPress={() => dispatch(quickDemoLogin('dairy'))}
            style={[styles.switchBadge, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.switchText}>🥛 Dairy View</Text>
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
        {/* Platform Stat Cards */}
        <View style={styles.statGrid}>
          <View style={styles.statRow}>
            <StatCard
              title="Platform GMV"
              value="₹14.8 L"
              subtitle="This month"
              trend="+18% MoM"
              style={{ marginRight: 8 }}
            />
            <StatCard
              title="Daily Volume"
              value="2,140 L"
              subtitle="Across Pune"
              style={{ marginLeft: 8 }}
            />
          </View>

          <View style={styles.statRow}>
            <StatCard
              title="Active Dairies"
              value={dairies.length}
              subtitle="Vendors onboard"
              style={{ marginRight: 8 }}
            />
            <StatCard
              title="Active Consumers"
              value="840"
              subtitle="Households"
              trend="+32 new"
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>

        {/* Dairies List Management */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Onboarded Dairies (Vendors)
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Manage milk vendor authorizations and SaaS status
            </Text>
          </View>

          <View style={styles.dairyList}>
            {dairies.map((dairy) => (
              <Card key={dairy.id} style={styles.dairyCard}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dairyName, { color: colors.textPrimary }]}>
                      {dairy.name}
                    </Text>
                    <Text style={[styles.dairyOwner, { color: colors.textSecondary }]}>
                      Owner: {dairy.owner} • {dairy.city}
                    </Text>
                    <Text style={[styles.dairyPhone, { color: colors.textMuted }]}>
                      {dairy.phone}
                    </Text>
                  </View>

                  <Badge
                    label={dairy.status.toUpperCase()}
                    variant={
                      dairy.status === 'active'
                        ? 'success'
                        : dairy.status === 'pending'
                        ? 'warning'
                        : 'error'
                    }
                  />
                </View>

                <View style={styles.metricsRow}>
                  <View>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Subscribers</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                      {dairy.activeSubscribers} homes
                    </Text>
                  </View>

                  <View>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Daily Quota</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>
                      {formatLitres(dairy.dailyVolume)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleToggleStatus(dairy.id)}
                    style={[
                      styles.toggleBtn,
                      {
                        backgroundColor:
                          dairy.status === 'active'
                            ? isDark ? colors.surface : '#F1F5F9'
                            : '#ECFDF5',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: dairy.status === 'active' ? '#EF4444' : colors.primary,
                      }}
                    >
                      {dairy.status === 'active' ? 'Suspend' : 'Activate'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </View>
        </View>

        {/* Demo Switcher */}
        <Card style={styles.roleCard} variant="outlined">
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            ⚡ Switch Portal Persona
          </Text>
          <View style={styles.roleBtns}>
            <Button
              title="👤 Customer (Rahul)"
              variant="outline"
              size="sm"
              onPress={() => dispatch(quickDemoLogin('customer'))}
              style={{ flex: 1 }}
            />
            <Button
              title="🥛 Dairy (Shailesh)"
              variant="outline"
              size="sm"
              onPress={() => dispatch(quickDemoLogin('dairy'))}
              style={{ flex: 1 }}
            />
            <Button
              title="🚚 Delivery (Suresh)"
              variant="outline"
              size="sm"
              onPress={() => dispatch(quickDemoLogin('delivery_boy'))}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* Log out */}
        <Button
          title="Log Out of Admin"
          variant="outline"
          onPress={() => dispatch(logout())}
          style={{ borderColor: '#EF4444' }}
          textStyle={{ color: '#EF4444' }}
        />
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
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  statGrid: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  dairyList: {
    gap: 12,
  },
  dairyCard: {
    padding: 16,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  dairyName: {
    fontSize: 16,
    fontWeight: '700',
  },
  dairyOwner: {
    fontSize: 12,
    marginTop: 2,
  },
  dairyPhone: {
    fontSize: 11,
    marginTop: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  roleCard: {
    padding: 16,
    gap: 12,
  },
  roleBtns: {
    flexDirection: 'row',
    gap: 8,
  },
});

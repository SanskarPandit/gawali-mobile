import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutDashboard, ClipboardList, Users, Package, TrendingUp } from 'lucide-react-native';
import { DairyTabParamList, DairyStackParamList } from './types';
import { DairyDashboardScreen } from '../../features/dairy/DairyDashboardScreen';
import { DairyDeliveriesScreen } from '../../features/dairy/DairyDeliveriesScreen';
import { DairyCustomersScreen } from '../../features/dairy/DairyCustomersScreen';
import { DairyCustomerDetailScreen } from '../../features/dairy/DairyCustomerDetailScreen';
import { DairyProductsScreen } from '../../features/dairy/DairyProductsScreen';
import { DairyReportsScreen } from '../../features/dairy/DairyReportsScreen';
import { DairyAddCustomerScreen } from '../../features/dairy/DairyAddCustomerScreen';
import { DairyBusinessProfileScreen } from '../../features/dairy/DairyBusinessProfileScreen';
import { DairyRoutesScreen } from '../../features/dairy/DairyRoutesScreen';
import { AccountSettingsScreen } from '../../features/settings/AccountSettingsScreen';
import { useTheme } from '../../shared/theme/ThemeContext';
import { useTranslation } from 'react-i18next';

const Tab = createBottomTabNavigator<DairyTabParamList>();
const Stack = createNativeStackNavigator<DairyStackParamList>();

const DairyTabs: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Dynamic safe padding ensuring bottom tabs never hide behind Android/iOS navigation bar
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 10);
  const tabHeight = 56 + bottomInset;

  return (
    <Tab.Navigator
      initialRouteName="DairyDashboard"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: tabHeight,
          paddingBottom: bottomInset,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="DairyDashboard"
        component={DairyDashboardScreen}
        options={{
          tabBarLabel: t('nav.dashboard', 'Dashboard'),
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="DairyDeliveries"
        component={DairyDeliveriesScreen}
        options={{
          tabBarLabel: t('nav.deliveries', 'Deliveries'),
          tabBarIcon: ({ color, size }) => <ClipboardList size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="DairyCustomers"
        component={DairyCustomersScreen}
        options={{
          tabBarLabel: t('nav.customers', 'Customers'),
          tabBarIcon: ({ color, size }) => <Users size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="DairyProducts"
        component={DairyProductsScreen}
        options={{
          tabBarLabel: t('nav.products', 'Products'),
          tabBarIcon: ({ color, size }) => <Package size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="DairyReports"
        component={DairyReportsScreen}
        options={{
          tabBarLabel: t('nav.reports', 'Reports'),
          tabBarIcon: ({ color, size }) => <TrendingUp size={size || 22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

export const DairyNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DairyTabs" component={DairyTabs} />
      <Stack.Screen name="DairyCustomerDetail" component={DairyCustomerDetailScreen} />
      <Stack.Screen name="DairyAddCustomer" component={DairyAddCustomerScreen} />
      <Stack.Screen name="DairyBusinessProfile" component={DairyBusinessProfileScreen} />
      <Stack.Screen name="DairyRoutes" component={DairyRoutesScreen} />
      <Stack.Screen name="DairySettings" component={AccountSettingsScreen} />
    </Stack.Navigator>
  );
};

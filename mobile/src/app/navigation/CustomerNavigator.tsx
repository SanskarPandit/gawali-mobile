import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Calendar, ShoppingBag, Receipt, User } from 'lucide-react-native';
import { CustomerTabParamList, CustomerStackParamList } from './types';
import { CustomerHomeScreen } from '../../features/customer/CustomerHomeScreen';
import { CustomerCalendarScreen } from '../../features/customer/CustomerCalendarScreen';
import { CustomerShopScreen } from '../../features/customer/CustomerShopScreen';
import { CustomerBillsScreen } from '../../features/customer/CustomerBillsScreen';
import { CustomerProfileScreen } from '../../features/customer/CustomerProfileScreen';
import { CustomerOnboardingScreen } from '../../features/customer/CustomerOnboardingScreen';
import { useGetCustomerProfileQuery } from '../../shared/api/gawaliApi';
import { LoadState } from '../../shared/ui';
import { AccountSettingsScreen } from '../../features/settings/AccountSettingsScreen';
import { useTheme } from '../../shared/theme/ThemeContext';
import { useTranslation } from 'react-i18next';

const Tab = createBottomTabNavigator<CustomerTabParamList>();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

const CustomerTabs: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Dynamic safe padding ensuring bottom tabs never hide behind Android/iOS navigation bar
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 10);
  const tabHeight = 56 + bottomInset;

  return (
    <Tab.Navigator
      initialRouteName="CustomerHome"
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
        name="CustomerHome"
        component={CustomerHomeScreen}
        options={{
          tabBarLabel: t('nav.home', 'Home'),
          tabBarIcon: ({ color, size }) => <Home size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="CustomerCalendar"
        component={CustomerCalendarScreen}
        options={{
          tabBarLabel: t('nav.calendar', 'Calendar'),
          tabBarIcon: ({ color, size }) => <Calendar size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="CustomerShop"
        component={CustomerShopScreen}
        options={{
          tabBarLabel: t('nav.store', 'Store'),
          tabBarIcon: ({ color, size }) => <ShoppingBag size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="CustomerBills"
        component={CustomerBillsScreen}
        options={{
          tabBarLabel: t('nav.bills', 'Bills'),
          tabBarIcon: ({ color, size }) => <Receipt size={size || 22} color={color} />,
        }}
      />
      <Tab.Screen
        name="CustomerProfile"
        component={CustomerProfileScreen}
        options={{
          tabBarLabel: t('nav.profile', 'Profile'),
          tabBarIcon: ({ color, size }) => <User size={size || 22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

export const CustomerNavigator: React.FC = () => {
  const profile = useGetCustomerProfileQuery();
  const { colors } = useTheme();

  // New customers must finish setup (dairy, plan, address) before the main app.
  if (!profile.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoadState isLoading={profile.isLoading || profile.isUninitialized} error={profile.error} hasData={false} onRetry={profile.refetch}>
          {null}
        </LoadState>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {profile.data.needs_onboarding ? (
        <Stack.Screen name="CustomerOnboarding" component={CustomerOnboardingScreen} />
      ) : (
        <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
      )}
      <Stack.Screen name="CustomerSettings" component={AccountSettingsScreen} />
    </Stack.Navigator>
  );
};

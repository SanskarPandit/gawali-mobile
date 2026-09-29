import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CustomerTabParamList } from './types';
import { CustomerHomeScreen } from '../../features/customer/CustomerHomeScreen';
import { CustomerCalendarScreen } from '../../features/customer/CustomerCalendarScreen';
import { CustomerShopScreen } from '../../features/customer/CustomerShopScreen';
import { CustomerBillsScreen } from '../../features/customer/CustomerBillsScreen';
import { CustomerProfileScreen } from '../../features/customer/CustomerProfileScreen';
import { useTheme } from '../../shared/theme/ThemeContext';

const Tab = createBottomTabNavigator<CustomerTabParamList>();

export const CustomerNavigator: React.FC = () => {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="CustomerHome"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="CustomerHome"
        component={CustomerHomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🥛</Text>,
        }}
      />
      <Tab.Screen
        name="CustomerCalendar"
        component={CustomerCalendarScreen}
        options={{
          tabBarLabel: 'Calendar',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📅</Text>,
        }}
      />
      <Tab.Screen
        name="CustomerShop"
        component={CustomerShopScreen}
        options={{
          tabBarLabel: 'Store',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🛍️</Text>,
        }}
      />
      <Tab.Screen
        name="CustomerBills"
        component={CustomerBillsScreen}
        options={{
          tabBarLabel: 'Bills',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>💳</Text>,
        }}
      />
      <Tab.Screen
        name="CustomerProfile"
        component={CustomerProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>👤</Text>,
        }}
      />
    </Tab.Navigator>
  );
};

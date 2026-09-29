import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DairyTabParamList, DairyStackParamList } from './types';
import { DairyDashboardScreen } from '../../features/dairy/DairyDashboardScreen';
import { DairyDeliveriesScreen } from '../../features/dairy/DairyDeliveriesScreen';
import { DairyCustomersScreen } from '../../features/dairy/DairyCustomersScreen';
import { DairyCustomerDetailScreen } from '../../features/dairy/DairyCustomerDetailScreen';
import { DairyProductsScreen } from '../../features/dairy/DairyProductsScreen';
import { DairyReportsScreen } from '../../features/dairy/DairyReportsScreen';
import { useTheme } from '../../shared/theme/ThemeContext';

const Tab = createBottomTabNavigator<DairyTabParamList>();
const Stack = createNativeStackNavigator<DairyStackParamList>();

const DairyTabs: React.FC = () => {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="DairyDashboard"
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
        name="DairyDashboard"
        component={DairyDashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="DairyDeliveries"
        component={DairyDeliveriesScreen}
        options={{
          tabBarLabel: 'Deliveries',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>,
        }}
      />
      <Tab.Screen
        name="DairyCustomers"
        component={DairyCustomersScreen}
        options={{
          tabBarLabel: 'Customers',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>👥</Text>,
        }}
      />
      <Tab.Screen
        name="DairyProducts"
        component={DairyProductsScreen}
        options={{
          tabBarLabel: 'Products',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏷️</Text>,
        }}
      />
      <Tab.Screen
        name="DairyReports"
        component={DairyReportsScreen}
        options={{
          tabBarLabel: 'Reports',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📈</Text>,
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
    </Stack.Navigator>
  );
};

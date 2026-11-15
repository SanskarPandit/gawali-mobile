import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminStackParamList } from './types';
import { AdminDashboardScreen } from '../../features/admin/AdminDashboardScreen';
import { AccountSettingsScreen } from '../../features/settings/AccountSettingsScreen';

const Stack = createNativeStackNavigator<AdminStackParamList>();

export const AdminNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminSettings" component={AccountSettingsScreen} />
    </Stack.Navigator>
  );
};

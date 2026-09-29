import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminTabParamList } from './types';
import { AdminDashboardScreen } from '../../features/admin/AdminDashboardScreen';

const Stack = createNativeStackNavigator<AdminTabParamList>();

export const AdminNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    </Stack.Navigator>
  );
};

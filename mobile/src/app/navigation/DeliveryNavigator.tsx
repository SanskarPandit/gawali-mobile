import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DeliveryStackParamList } from './types';
import { DeliveryRouteScreen } from '../../features/delivery/DeliveryRouteScreen';
import { AccountSettingsScreen } from '../../features/settings/AccountSettingsScreen';

const Stack = createNativeStackNavigator<DeliveryStackParamList>();

export const DeliveryNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DeliveryRoute" component={DeliveryRouteScreen} />
      <Stack.Screen name="DeliverySettings" component={AccountSettingsScreen} />
    </Stack.Navigator>
  );
};

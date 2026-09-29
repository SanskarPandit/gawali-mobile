import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DeliveryTabParamList } from './types';
import { DeliveryRouteScreen } from '../../features/delivery/DeliveryRouteScreen';

const Stack = createNativeStackNavigator<DeliveryTabParamList>();

export const DeliveryNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DeliveryRoute" component={DeliveryRouteScreen} />
    </Stack.Navigator>
  );
};

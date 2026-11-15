import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector } from '../store';
import { AuthNavigator } from './AuthNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { DairyNavigator } from './DairyNavigator';
import { DeliveryNavigator } from './DeliveryNavigator';
import { AdminNavigator } from './AdminNavigator';

const Stack = createNativeStackNavigator();

/**
 * Role gate. Exactly one app is mounted, chosen from the signed-in user's role,
 * so screens of other roles are never registered and cannot be navigated to.
 */
export const RootNavigator: React.FC = () => {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  const renderApp = () => {
    if (!isAuthenticated || !user) {
      return <Stack.Screen name="Auth" component={AuthNavigator} />;
    }
    switch (user.role) {
      case 'customer':
        return <Stack.Screen name="CustomerApp" component={CustomerNavigator} />;
      case 'dairy':
        return <Stack.Screen name="DairyApp" component={DairyNavigator} />;
      case 'delivery_boy':
        return <Stack.Screen name="DeliveryApp" component={DeliveryNavigator} />;
      case 'admin':
        return <Stack.Screen name="AdminApp" component={AdminNavigator} />;
      default:
        // Unknown role from the server: fail closed rather than guessing an app.
        return <Stack.Screen name="Auth" component={AuthNavigator} />;
    }
  };

  return <Stack.Navigator screenOptions={{ headerShown: false }}>{renderApp()}</Stack.Navigator>;
};

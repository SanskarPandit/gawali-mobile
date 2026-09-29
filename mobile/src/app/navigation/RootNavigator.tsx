import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector } from '../store';
import { AuthNavigator } from './AuthNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { DairyNavigator } from './DairyNavigator';
import { DeliveryNavigator } from './DeliveryNavigator';
import { AdminNavigator } from './AdminNavigator';
import { useTheme } from '../../shared/theme/ThemeContext';

const Stack = createNativeStackNavigator();

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAppSelector((state) => state.auth);
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated || !user ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : user.role === 'customer' ? (
        <Stack.Screen name="CustomerApp" component={CustomerNavigator} />
      ) : user.role === 'dairy' ? (
        <Stack.Screen name="DairyApp" component={DairyNavigator} />
      ) : user.role === 'delivery_boy' ? (
        <Stack.Screen name="DeliveryApp" component={DeliveryNavigator} />
      ) : (
        <Stack.Screen name="AdminApp" component={AdminNavigator} />
      )}
    </Stack.Navigator>
  );
};

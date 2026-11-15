import React from 'react';
import { StatusBar } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { store } from './store';
import { ThemeProvider, useTheme } from '../shared/theme/ThemeContext';
import { RootNavigator } from './navigation/RootNavigator';
import '../shared/i18n/i18n';

import { useAppSelector } from './store';
import i18n from '../shared/i18n/i18n';

const AppContent: React.FC = () => {
  const { isDark } = useTheme();
  const currentLanguage = useAppSelector((state) => state.auth.currentLanguage);

  React.useEffect(() => {
    if (i18n.language !== currentLanguage) {
      i18n.changeLanguage(currentLanguage);
    }
  }, [currentLanguage]);

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </Provider>
  );
};

export default App;

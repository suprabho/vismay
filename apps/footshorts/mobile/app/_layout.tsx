import '../global.css';
import 'react-native-url-polyfill/auto';

import {
  ThemeProvider,
  useTheme,
  type ThemeStorage,
} from '@footshorts/brand/native';
import type { ThemeName } from '@footshorts/brand';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/AuthProvider';

// React Native has no window focus event, so refetchOnWindowFocus is inert
// unless the focus manager is driven by AppState. Without this, an app
// resumed from background keeps showing whatever React Query cached at the
// last mount — stale scores survive indefinitely.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

const THEME_STORAGE_KEY = 'sf.theme';

const themeStorage: ThemeStorage = {
  load: async () => {
    const value = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
    return (value as ThemeName | null) ?? null;
  },
  save: async (name) => {
    await SecureStore.setItemAsync(THEME_STORAGE_KEY, name);
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: true },
  },
});

function ThemedStack() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider storage={themeStorage}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ThemedStack />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import '../global.css';
import 'react-native-url-polyfill/auto';

import {
  ThemeProvider,
  useTheme,
  type ThemeStorage,
} from '@shortfoot/brand/native';
import type { ThemeName } from '@shortfoot/brand';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/AuthProvider';

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
    queries: { staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

function ThemedStack() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style="light" />
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

import '../global.css';
import 'react-native-url-polyfill/auto';

import { useEffect } from 'react';

import {
  ThemeProvider,
  useTheme,
  type ThemeStorage,
} from '@footshorts/brand/native';
import type { ThemeName } from '@footshorts/brand';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Forum_400Regular } from '@expo-google-fonts/forum';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { Stack, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/AuthProvider';
import { initAnalytics, setAnalyticsUser, trackScreenViewed } from '@/lib/analytics';

// Boot Amplitude before the first screen renders. No-ops without
// EXPO_PUBLIC_AMPLITUDE_API_KEY (local dev builds send nothing).
initAnalytics();

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

// Hold the splash until the brand faces are registered, so no screen renders a
// frame in the system font and then reflows.
void SplashScreen.preventAutoHideAsync();

/**
 * The brand themes declare typography as CSS font stacks, which only the web
 * app can resolve. Native needs the faces registered by name — one per weight,
 * since React Native doesn't synthesise weights for custom fonts.
 */
const BRAND_FONTS = {
  Forum_400Regular,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  SpaceMono_400Regular,
};

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

/**
 * Native counterpart of web's autocaptured page views: one `screen_viewed`
 * per route change, and the Amplitude identity kept in sync with the
 * Supabase session (auth method events are tracked in AuthProvider).
 */
function AnalyticsTracker() {
  const pathname = usePathname();
  const { session, loading } = useAuth();

  useEffect(() => {
    trackScreenViewed(pathname);
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    setAnalyticsUser(session?.user.id ?? null);
  }, [session, loading]);

  return null;
}

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
  const [fontsLoaded, fontError] = useFonts(BRAND_FONTS);

  // A missing face shouldn't wedge the app on the splash — fall through to the
  // system font and let the screens render.
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider storage={themeStorage}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AnalyticsTracker />
              <ThemedStack />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

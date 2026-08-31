import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Footshorts',
  slug: 'footshorts',
  owner: 'promaddesign',
  // Store-facing version (CFBundleShortVersionString / versionName). The live
  // App Store release is 1.0 — new uploads must stay ahead of it. Build
  // numbers/versionCodes are managed remotely by EAS (appVersionSource).
  version: '1.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  scheme: 'footshorts',
  icon: './assets/icon.png',
  // 0.3.0: expo-apple-authentication + expo-splash-screen (0.2.0 added
  // react-native-svg + expo-web-browser + expo-crypto). Each runtime bump
  // fences OTA updates away from binaries that lack the new native modules.
  runtimeVersion: '0.3.0',
  updates: {
    url: 'https://u.expo.dev/ec487831-05e0-4a95-8ae4-c14736fa0375',
  },
  ios: {
    bundleIdentifier: 'com.promad.footshorts',
    usesAppleSignIn: true,
  },
  android: {
    package: 'com.promad.footshorts',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: '#0B0B0F',
    },
  },
  plugins: [
    'expo-web-browser',
    'expo-apple-authentication',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#0B0B0F',
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { newArchEnabled: true },
        android: { newArchEnabled: true },
      },
    ],
  ],
  extra: {
    eas: {
      projectId: 'ec487831-05e0-4a95-8ae4-c14736fa0375',
    },
  },
};

export default config;

import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Footshorts',
  slug: 'footshorts',
  owner: 'promaddesign',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  scheme: 'footshorts',
  // 0.2.0: react-native-svg + expo-web-browser + expo-crypto add native code —
  // OTA updates on this runtime must never reach 0.1.0 binaries.
  runtimeVersion: '0.2.0',
  updates: {
    url: 'https://u.expo.dev/ec487831-05e0-4a95-8ae4-c14736fa0375',
  },
  ios: {
    bundleIdentifier: 'app.footshorts',
    buildNumber: '3',
  },
  android: {
    package: 'app.footshorts',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#0B0B0F',
    },
  },
  plugins: [
    'expo-web-browser',
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

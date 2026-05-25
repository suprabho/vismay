import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Footshorts',
  slug: 'footshorts',
  owner: 'promaddesign',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  scheme: 'footshorts',
  runtimeVersion: '0.1.0',
  updates: {
    url: 'https://u.expo.dev/ec487831-05e0-4a95-8ae4-c14736fa0375',
  },
  ios: {
    bundleIdentifier: 'app.footshorts',
    buildNumber: '2',
  },
  android: {
    package: 'app.footshorts',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#0B0B0F',
    },
  },
  plugins: [
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

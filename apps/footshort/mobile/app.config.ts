import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ShortFoot',
  slug: 'footshort',
  owner: 'promaddesign',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  scheme: 'shortfoot',
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/718ceb3c-a4cc-4180-867f-813e1be1d476',
  },
  ios: {
    bundleIdentifier: 'app.shortfoot',
    buildNumber: '2',
  },
  android: {
    package: 'app.shortfoot',
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
      projectId: '718ceb3c-a4cc-4180-867f-813e1be1d476',
    },
  },
};

export default config;

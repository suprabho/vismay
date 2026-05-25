import type { Config } from 'tailwindcss';
import nativewindPreset from 'nativewind/preset';
import { brandPreset } from '@footshorts/brand/tailwind';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    // Shared presentational components (MatchRow, MatchTile, …) live here and
    // use NativeWind classes. Without this glob NativeWind only compiles
    // classes that also appear in this app's own files, so any class used
    // *only* by the package (e.g. justify-end) is silently dropped and falls
    // back to RN defaults. Mirrors the web app's tailwind content config.
    '../../../verticals/footshorts-viz/src/**/*.{ts,tsx}',
  ],
  presets: [nativewindPreset, brandPreset() as Config],
};

export default config;

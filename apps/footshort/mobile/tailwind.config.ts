import type { Config } from 'tailwindcss';
import nativewindPreset from 'nativewind/preset';
import { brandPreset } from '@shortfoot/brand/tailwind';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [nativewindPreset, brandPreset() as Config],
};

export default config;

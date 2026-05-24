import type { Config } from 'tailwindcss';
import { brandPreset } from '@footshorts/brand/tailwind';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../../verticals/footshorts-viz/src/**/*.{ts,tsx}',
  ],
  presets: [brandPreset() as Config],
};

export default config;

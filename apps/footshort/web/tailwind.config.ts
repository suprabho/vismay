import type { Config } from 'tailwindcss';
import { brandPreset } from '@shortfoot/brand/tailwind';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [brandPreset() as Config],
};

export default config;

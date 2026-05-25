import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@vismay/viz-engine',
    '@vismay/f1-viz',
    '@vismay/footshorts-viz',
    '@vismay/viz-admin',
  ],
}

export default nextConfig

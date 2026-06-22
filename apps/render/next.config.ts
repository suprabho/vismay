import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TS source (no build step). Next must transpile
  // them so the `'use client'` directives, JSX, and TS syntax work in the app.
  transpilePackages: ["@vismay/admin-core", "@vismay/content-source", "@vismay/story-reader", "@vismay/render-surface", "@vismay/viz-engine", "@vismay/footshorts-viz", "@vismay/f1-viz", "@vismay/starship-viz", "@vismay/kidzovo-viz", "@vismay/verticals"],
};

export default nextConfig;

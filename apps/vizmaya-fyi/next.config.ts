import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright pulls in native browser drivers — bundling it for the server
  // build breaks at runtime. Marking it external lets the API route require
  // it from node_modules at request time, the way the CLI script does.
  serverExternalPackages: ["playwright", "playwright-core"],
  // Workspace packages ship TS source (no build step). Next must transpile
  // them so the `'use client'` directives, JSX, and TS syntax work in the app.
  transpilePackages: ["@vismay/viz-engine", "@vismay/footshort-viz"],
};

export default nextConfig;


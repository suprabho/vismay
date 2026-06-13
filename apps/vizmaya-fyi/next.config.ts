import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright pulls in native browser drivers — bundling it for the server
  // build breaks at runtime. Marking it external lets the API route require
  // it from node_modules at request time, the way the CLI script does.
  serverExternalPackages: ["playwright", "playwright-core"],
  // Workspace packages ship TS source (no build step). Next must transpile
  // them so the `'use client'` directives, JSX, and TS syntax work in the app.
  transpilePackages: ["@vismay/admin-core", "@vismay/content-source", "@vismay/story-reader", "@vismay/viz-engine", "@vismay/footshorts-viz", "@vismay/f1-viz", "@vismay/starship-viz", "@vismay/kidzovo-viz", "@vismay/verticals"],
  async headers() {
    return [
      {
        // /wallet-geo is iframe-embeddable from any origin (epic landing
        // pages are designed to be dropped into partner sites). The default
        // Next.js response has no frame-ancestors CSP, but we set it
        // explicitly so any reverse proxy / platform default that adds
        // `frame-ancestors 'self'` gets overridden in our favor.
        source: "/wallet-geo",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;


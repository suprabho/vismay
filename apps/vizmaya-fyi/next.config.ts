import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright pulls in native browser drivers — bundling it for the server
  // build breaks at runtime. Marking it external lets the API route require
  // it from node_modules at request time, the way the CLI script does.
  serverExternalPackages: ["playwright", "playwright-core"],
  // Workspace packages ship TS source (no build step). Next must transpile
  // them so the `'use client'` directives, JSX, and TS syntax work in the app.
  transpilePackages: ["@vismay/admin-core", "@vismay/content-source", "@vismay/viz-engine", "@vismay/footshort-viz", "@vismay/f1-viz"],
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
      {
        // Gated "output" routes are designed to be embedded by admin
        // (canvas iframes, share-card preview, autoplay capture, PDF
        // render). Admin lives on a different TLD (vismay.xyz) in prod,
        // so cross-origin embedding must be allowed — the signed-URL
        // token in the query string is the access control here, not
        // frame-ancestors. Without this override Vercel's default
        // `frame-ancestors 'self'` blocks the iframe.
        source: "/story/:slug/share",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        source: "/story/:slug/autoplay",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        source: "/story/:slug/canvas-frame/:id",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        source: "/story/:slug/report",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        source: "/story/:slug/slides",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;


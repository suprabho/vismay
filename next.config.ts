import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright pulls in native browser drivers — bundling it for the server
  // build breaks at runtime. Marking it external lets the API route require
  // it from node_modules at request time, the way the CLI script does.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;


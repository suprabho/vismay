# Official Playwright image: Chromium + all system deps preinstalled at
# /ms-playwright. Keep the tag in lockstep with the `playwright` version in
# package.json — a mismatch makes Playwright look for a browser build that
# isn't in the image.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app
ENV NODE_ENV=production

# npm (not pnpm): this service is deliberately self-contained — no workspace
# deps — so any container host can build it from this directory alone.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

EXPOSE 8080
CMD ["node", "server.mjs"]

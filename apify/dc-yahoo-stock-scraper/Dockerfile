# Apify's Node 20 actor base image (includes the Apify CLI + apify SDK deps).
FROM apify/actor-node:20

# Install production deps against the copied manifests first for better caching.
COPY package*.json ./
RUN npm --quiet set progress=false \
  && npm install --omit=dev --omit=optional \
  && echo "Installed npm packages:" \
  && (npm list --omit=dev --all || true)

# Then the source.
COPY . ./

CMD ["npm", "start", "--silent"]

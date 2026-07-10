# Wraps the upstream voicebox image (built separately from the pinned SHA —
# see .github/workflows/build-voicebox-image.yml) with a Caddy bearer-token
# proxy. Voicebox ships no auth of its own, and this app is reachable over
# the public internet, so the proxy is mandatory: never expose 17493 directly.
#
# Build (CI does this):
#   docker build -t voicebox-upstream:<ref> "https://github.com/jamiepine/voicebox.git#<ref>"
#   docker build -t <image> --build-arg VOICEBOX_BASE=voicebox-upstream:<ref> infra/voicebox

ARG VOICEBOX_BASE=voicebox-upstream:local
FROM ${VOICEBOX_BASE}

USER root

# Caddy is a single static binary — lift it from the official image.
COPY --from=caddy:2.8 /usr/bin/caddy /usr/local/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY entrypoint.sh /usr/local/bin/vismay-entrypoint.sh
RUN chmod +x /usr/local/bin/vismay-entrypoint.sh

# Fly routes only to Caddy's port; uvicorn stays on loopback (see CMD).
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/vismay-entrypoint.sh"]
# Redefining ENTRYPOINT resets the upstream CMD — restate it, but bind
# uvicorn to loopback so the token proxy is the only reachable surface.
CMD ["uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "17493"]

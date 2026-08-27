#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Store release: cloud builds on EAS, production profile on both platforms.
# - iOS: --auto-submit uploads straight to TestFlight (ascAppId in eas.json).
# - Android: production builds an .aab; submit targets the Play internal
#   track (eas.json submit config). NOTE: Play requires the very FIRST .aab
#   of a new app to be uploaded manually in the Play Console UI — pass
#   SKIP_ANDROID_SUBMIT=1 for that first run and upload the artifact from
#   the EAS build page yourself.

echo "[1/2] Building iOS on EAS + submitting to TestFlight..."
eas build \
  --platform ios \
  --profile production \
  --non-interactive \
  --auto-submit

if [[ "${SKIP_ANDROID_SUBMIT:-0}" == "1" ]]; then
  echo "[2/2] Building Android .aab on EAS (no submit — first upload is manual)..."
  eas build \
    --platform android \
    --profile production \
    --non-interactive
else
  echo "[2/2] Building Android .aab on EAS + submitting to the Play internal track..."
  eas build \
    --platform android \
    --profile production \
    --non-interactive \
    --auto-submit
fi

echo "Done. Track progress at https://expo.dev/accounts/promaddesign/projects/footshorts/builds"

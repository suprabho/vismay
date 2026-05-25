#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

mkdir -p build

echo "[1/3] Building iOS IPA locally..."
eas build \
  --platform ios \
  --profile production \
  --local \
  --non-interactive \
  --output "$(pwd)/build/app.ipa"

echo "[2/3] Uploading IPA to TestFlight..."
eas submit \
  --platform ios \
  --path "$(pwd)/build/app.ipa" \
  --profile production \
  --non-interactive

echo "[3/3] Building Android APK locally..."
eas build \
  --platform android \
  --profile preview \
  --local \
  --non-interactive \
  --output "$(pwd)/build/app.apk"

echo "Done."
echo "  APK: apps/mobile/build/app.apk"
echo "  IPA uploaded to TestFlight (processing on App Store Connect)."

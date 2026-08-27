#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Local Android APK build — offline, no Expo login.
# Regenerates the CNG native project (android/ is gitignored, generated from
# app.config.ts) and Gradle-builds a standalone, debug-signed release APK.
# Output: android/app/build/outputs/apk/release/app-release.apk
#
# Prereqs (already set up on the primary dev Mac): JDK 17 (JAVA_HOME), the
# Android SDK (ANDROID_HOME), and `pnpm install` run once at the repo root.

APK="android/app/build/outputs/apk/release/app-release.apk"

# Safety: the EXPO_PUBLIC_ prefix inlines a value into the shipped JS bundle, so
# a service-role / secret must never carry it. Refuse to build if an *active*
# (uncommented) .env line does — otherwise the one-command build silently leaks.
if [[ -f .env ]] && grep -Eq '^[[:space:]]*EXPO_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET)' .env; then
  echo "ERROR: .env has an active EXPO_PUBLIC_ secret (SERVICE_ROLE/SECRET) — it would" >&2
  echo "       leak into the APK bundle. Comment it out or drop the EXPO_PUBLIC_ prefix," >&2
  echo "       then rerun. (The app reads only EXPO_PUBLIC_SUPABASE_URL + _ANON_KEY.)" >&2
  exit 1
fi

echo "[1/2] Prebuild — regenerating android/ from app.config.ts..."
CI=1 pnpm exec expo prebuild --platform android --clean --no-install

echo "[2/2] Gradle — assembling release APK (first run can take ~6-20 min)..."
( cd android && ./gradlew assembleRelease )

echo ""
echo "Done. APK:"
ls -lh "$APK"
echo ""
echo "Install to a connected device/emulator:"
echo "  adb install -r \"$(pwd)/$APK\""

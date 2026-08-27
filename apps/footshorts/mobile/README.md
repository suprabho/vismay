# @footshorts/mobile

Expo (SDK 55) app for Footshorts. Uses **Continuous Native Generation** — `android/`
and `ios/` are gitignored and regenerated from `app.config.ts` by `expo prebuild`;
never hand-edit them.

## Local Android build (APK)

One command produces a standalone, installable **release APK** — no Expo account,
fully offline:

```bash
pnpm apk:local                              # from apps/footshorts/mobile
pnpm --filter @footshorts/mobile apk:local  # from the repo root
```

Output: `android/app/build/outputs/apk/release/app-release.apk` (~95 MB universal;
package `app.footshorts`). It's signed with the Expo debug keystore, so it installs
directly and runs standalone (JS bundled with Hermes — no Metro dev server needed).

**Prerequisites** (already set up on the primary dev Mac):

- JDK 17 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`)
- `pnpm install` run once at the repo root

**Install it** onto a connected device or a running emulator:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

No device/emulator attached? Either plug in an Android phone with USB debugging on,
or create an emulator once:

```bash
sdkmanager "emulator" "system-images;android-35;google_apis_playstore;arm64-v8a"
avdmanager create avd -n fs_pixel -k "system-images;android-35;google_apis_playstore;arm64-v8a"
emulator -avd fs_pixel        # then rerun the adb install above
```

> ⚠️ **Never** give a secret the `EXPO_PUBLIC_` prefix in `.env` — that prefix inlines
> the value into the shipped bundle. `apk:local` aborts if it finds an active
> `EXPO_PUBLIC_*SECRET` / `*SERVICE_ROLE*` var. The app reads only
> `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Other scripts

- `pnpm start` — Expo dev server
- `pnpm android` / `pnpm ios` — dev build + install to a device/emulator (needs Metro)
- `pnpm release` — EAS **cloud** production builds (iOS → TestFlight, Android → Play
  internal); see `scripts/release.sh`

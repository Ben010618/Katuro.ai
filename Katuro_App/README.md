# KaTuro App

The phone and tablet version of KaTuro (Android first, iOS later). It is built from the same
React code in `../src` as the website and KaTuroDesk, wrapped with Capacitor. It works with
KaTuroDesk on the teacher's computer (same KaTuro account, linked once by QR code).

See [PLAN.md](PLAN.md) for the approach and phases, and [CHANGELOG.md](CHANGELOG.md) for the versions.

## Versions

`version` in `package.json` is the app's version (v1.0.0, v1.0.1, v1.1.0 …). Android's
version number is made from it (1.2.3 → 10203); a phone only updates to a higher one.

## Making a release

Needs Node 22+, Android Studio (SDK in `%LOCALAPPDATA%\Android\Sdk`; its own JDK is used) and
the release key in `%USERPROFILE%\.katuro-signing\` (**back this folder up**: every update must
be signed with the same key, or installed apps cannot update).

1. Raise `version` in `package.json` and add the notes on top of `CHANGELOG.md`.
2. `node scripts/release.mjs` → `KaTuro-App-<version>.apk` and `katuro-app-latest.json` in the
   KaTuroDesk output folder (`C:\Users\USER\KaTuroDesk-Dist`).
3. **USB install** (first time on a device): copy the APK to the phone/tablet, open it, allow
   "Install unknown apps" for the file manager when Android asks.
4. **Online update** of installed apps: `node scripts/release.mjs --publish` (GitHub CLI signed
   in). It uploads to the pre-release `katuro-app` on GitHub; each app checks once a day and
   from Menu → Check for updates, downloads, checks the file and asks Android to update in
   place (no uninstall, data kept).

## Building for testing

1. `npm install` (first time only)
2. `npm run build:web` - builds `../src` with `vite build --mode mobile` into `../dist-mobile/`
3. `npm run sync` - copies `../dist-mobile/` and the plugins into `android/`
4. `cd android` then `gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`

Icons and the launch screen come from `../public/favicon.png`: `powershell -File scripts\make-icons.ps1`.

In the shared code, `src/services/platform.js` tells the shells apart (`isMobile()`,
`isDesk()`, `isWeb()`); native parts are `android/app/src/main/java/ai/katuro/app/`
(Share → KaTuro, online updates).

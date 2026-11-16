# KaTuro App

The phone version of KaTuro (Android first, iOS later). It is built from the same React
code in `../src` as the web app and KaTuroDesk, wrapped with Capacitor.

**Status:** Phase 0 (groundwork). See [PLAN.md](PLAN.md) for the approach, the features, the
phases and the decisions still open.

## How to build (Android)

Needs Node 22+, Android Studio (its SDK in `%LOCALAPPDATA%\Android\Sdk`) and JDK 21. Gradle
8.14 does not run on JDK 25, so use Android Studio's own JDK:
`JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`.

Run these inside `Katuro_App/`:

1. `npm install` (first time only)
2. `npm run build:web` - builds `../src` with `vite build --mode mobile` into `../dist-mobile/`
3. `npm run sync` - copies `../dist-mobile/` and the plugins into `android/`
4. Either `npm run open` (opens Android Studio; press Run), or build a test APK from the
   command line: `cd android` then `gradlew assembleDebug` (Windows) / `./gradlew assembleDebug`.
   The APK is `android/app/build/outputs/apk/debug/app-debug.apk`.

Repeat steps 2 and 3 after every change in `src/`.

In the shared code, `src/services/platform.js` tells the shells apart (`isMobile()`,
`isDesk()`, `isWeb()`).

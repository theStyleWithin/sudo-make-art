# Android

The Android app is a Capacitor wrapper (`../../android`) around the same web code as the desktop app.
It declares no internet permission and disables cloud backup, so your files stay on the phone.

- CI builds an unsigned **debug APK** (`android` job in `.github/workflows/build.yml`); sideload it to try it.
- Local build needs the Android SDK and JDK 17+: `npm run android:sync`, then `cd android && ./gradlew assembleDebug`.
- Play Store / F-Droid need a signed release build and listing, which is not set up.

Status: written without an Android SDK available, so the APK has not been run on a device yet.
Known gaps: video export is WebM only (no FFmpeg on Android), the editor uses the same UI scaled to phone width
(no pinch-to-zoom), and saving goes through the Android share sheet.

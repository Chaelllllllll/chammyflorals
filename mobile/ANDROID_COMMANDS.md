# Quick Commands for Android App

## Build React App
npm run build

## Initialize Capacitor (First time only)
npx cap init "Chammy Florals" "com.chammyflorals.app"

## Add Android Platform (First time only)
npx cap add android

## Sync changes to Android
npx cap sync

## Copy web assets
npx cap copy

## Open in Android Studio
npx cap open android

## Update plugins
npx cap update

---

## Build APK

### Debug APK (for testing):
```bash
cd android
./gradlew assembleDebug
```
APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (for publishing):
```bash
cd android
./gradlew assembleRelease
```
APK location: `android/app/build/outputs/apk/release/app-release.apk`

---

## Install on Device

### Via USB:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Via File Transfer:
1. Copy APK to phone
2. Open file manager on phone
3. Tap the APK file
4. Allow installation from unknown sources
5. Install

---

## Development Workflow

1. Make changes to React app
2. Run: `npm run build`
3. Run: `npx cap sync`
4. Test in Android Studio or device
5. Repeat

---

## Update API URLs for Production

Before building release APK, update:
- `src/services/api.js` to use your production URL
- Or use environment variables

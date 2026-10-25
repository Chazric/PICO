# Store builds (Android + iOS)

App identity: **PICO**, package / bundle ID **`com.redreishi.pico`** (permanent once uploaded).
Support: redreishilife+pico@gmail.com · Legal pages: https://pico-legal.onrender.com (source: `legal-site/`, regenerate with `python3 docs/legal/build_legal.py`).

Test API (mock supplier + mock billing): `https://pico-api-ph57.onrender.com`.

## Android

Release signing reads `app/android/key.properties` (git-ignored) or the file named by `PICO_KEY_PROPERTIES`:

```
storePassword=...
keyPassword=...
keyAlias=pico-upload
storeFile=/absolute/path/to/pico-upload.jks
```

Without it, release builds fall back to the debug key (local testing only — Play will reject them).

```bash
cd app
flutter build apk --release --dart-define=API_BASE=https://pico-api-ph57.onrender.com      # sideload/test
flutter build appbundle --release --dart-define=API_BASE=https://pico-api-ph57.onrender.com # Play upload
```

Bump `version:` in `app/pubspec.yaml` (`1.0.0+1` → `1.0.1+2`) before every new upload.

## iOS (needs a Mac with Xcode)

```bash
cd app
flutter pub get
cd ios && pod install && cd ..
flutter build ipa --release --dart-define=API_BASE=https://pico-api-ph57.onrender.com
```

Open `ios/Runner.xcworkspace`, select your Apple Developer team under Signing & Capabilities, then upload
`build/ios/ipa/*.ipa` with Transporter or Xcode Organizer. See `docs/XCODE_PREP.md`.

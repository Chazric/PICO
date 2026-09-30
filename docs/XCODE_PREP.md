# Xcode / iOS preparation checklist

Everything code-side is done. On a Mac with Xcode 15+:

## Already configured in-repo

- `ios/` + `android/` scaffolds generated (`flutter create --platforms=ios,android`).
- `IPHONEOS_DEPLOYMENT_TARGET = 13.0` in `project.pbxproj` (Stripe iOS floor).
- `flutter_stripe: ^13.0.0` dependency; real Payment Sheet wired in checkout —
  activates automatically when the backend reports `billingMode: 'stripe'`.
- Android `MainActivity` uses `FlutterFragmentActivity` (required by Payment Sheet).
- App id: `ai.pico.pico_app` (rename now if you want a different bundle id —
  it's easiest before signing).

## On the Mac

```bash
cd app
flutter pub get
flutter build ios --dart-define=API_BASE=https://<your-api-host>   # generates ios/Podfile
cd ios && pod install
open Runner.xcworkspace    # workspace, not .xcodeproj
```

In Xcode:
1. Signing: select your Apple Developer team for the `Runner` target.
2. `Runner/Info.plist` — no extra keys needed for Stripe cards; Apple Pay adds
   `com.apple.developer.in-app-payments` (merchant id in Xcode → Signing &
   Capabilities → Apple Pay) — defer until the account exists.
3. Device build: Product → Run on a physical device (simulator can't do
   Payment Sheet eSIM-adjacent flows reliably).

## Still missing (needs real accounts, documented not faked)

| Need | Where |
|---|---|
| Stripe test keys (`sk_test_`, `pk_test_`, `whsec_`) | `server/.env` — backend auto-switches to `billingMode: 'stripe'` |
| Apple Developer account ($99) | for signing + device installs |
| Webhook endpoint reachable by Stripe | e.g. `stripe listen --forward-to localhost:4242/api/v1/webhooks/stripe` in dev |
| eSIM entitlement (`com.apple.euicc` / CTCellularPlanProvisioning) | Sprint 2 — requires Apple approval |

## Honest note
The Payment Sheet path is coded but **not executable here** — this machine has
no Xcode/iOS SDK, so iOS validation happens on your Mac. `flutter analyze` +
all widget tests are green.

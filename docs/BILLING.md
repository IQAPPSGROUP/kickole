# Purchases

Kickolé is a paid app. The price is set in App Store Connect and the Play Console. It is not a value in this repository.

This build has no in-app purchases. There is no StoreKit or Play Billing plugin, no shop, no Restore Purchases, and no purchase-token handling. The Xcode project does not enable the In-App Purchase capability, and `capacitor.config.ts` has no billing plugin. Kit choice stays on the device and is not sent with a score.

Do not add store products, a billing plugin, or a purchase capability for this release.

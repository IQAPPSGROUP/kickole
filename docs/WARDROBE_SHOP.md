# Wardrobe

Cosmetic customisation for Kickolé. Physics, timing windows and scoring never read the equipped look.

There is no shop and no coin balance. National kit colours are free and stay on the device. The price of the app is set in the stores, not in this repo. See [`BILLING.md`](./BILLING.md).

## Free customise

- Skin tones, hair colours and the footballer body. The footballer keeps the hair that shipped on the model.
- Kit colours never change skin tone or hair colour.

## Saved looks

Older saves may still name a starter boot and a starter kit. A cowboy boot id is dropped on load. Costume packs, product ids, and store grants are not read.

`kicky.save.v1` wardrobe schema is version 4. Legacy `street`/`samba`/`carnival`/`ole` boots and settings `skinId` map into the catalogue once, while `wardrobeVersion` is still below 2. Later launches keep the saved appearance even if settings still hold `coral-flash` or `lime-night`. Scores and records are kept. Coin balances are dropped.

Internal testers: [`TESTER_INSTRUCTIONS.md`](./TESTER_INSTRUCTIONS.md). Store Data Safety / privacy answers: [`STORE_DATA_SAFETY.md`](./STORE_DATA_SAFETY.md). Release notes: [`RELEASE_VALIDATION.md`](./RELEASE_VALIDATION.md).

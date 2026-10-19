# Wardrobe and shop

Cosmetic customisation and soft-currency shop for Kickolé. Physics, timing windows and scoring never read shop equipment.

## Free customise

- Skin tones, hair colours, hair silhouettes (afro, mohawk, high-top, short curls, braids, spikes, shaved, bald) and basic clothing swatches.
- Hair variants are procedural meshes parented to the head bone on the Quaternius v2 rig.
- Boots/kits never change skin tone, hair colour or hair style.

## Shop catalogue (launch)

- **Boots (8):** Street Classic (free), Beach Wave, Carnival Flex, Midnight Grip, Mosaic Tile, Street Runner, Gold Touch, Legend Spike.
- **Kits (6):** Street Classic (free), Beach Wave, Carnival, Midnight, Mosaic, Gold.
- Themes use distinct panel/trim/lace/pattern finishes rather than flat recolours.

## Progression

| Tier | Coins (accumulated) | Challenge |
| --- | --- | --- |
| Club | 2,500 | — |
| Street | 7,500 | Alternating foot touches (lifetime) |
| Freestyle | 15,000 | Foot stalls (lifetime) |
| Legend | 30,000 | Perfect touches (lifetime) |

Coins = floor(run score) per completed scoring run. Run score, spendable coins and challenge tallies are shown separately.

## Launch Collection

`LAUNCH_COLLECTION_ITEM_IDS` lists every launch boot and kit (14). The one-time **Kickolé Launch Collection** purchase (StoreKit 2 / Play Billing 9) grants those IDs after store verification, including items that otherwise need challenge progress. It does not complete the challenges themselves. See [`BILLING.md`](./BILLING.md). Browser builds cannot take real payments.

Internal testers: [`TESTER_INSTRUCTIONS.md`](./TESTER_INSTRUCTIONS.md). Store Data Safety / privacy answers: [`STORE_DATA_SAFETY.md`](./STORE_DATA_SAFETY.md). Release matrix: [`RELEASE_VALIDATION.md`](./RELEASE_VALIDATION.md).

## Migration

`kicky.save.v1` v2 adds coins, boots, kits, appearance and challenges. Legacy `street`/`samba`/`carnival`/`ole` boots and settings `skinId` map into the new catalogue once, while `wardrobeVersion` is still below 2. Later launches keep the saved appearance even if settings still hold `coral-flash` or `lime-night`. Balances and records are not wiped.

import { packButtonLabel } from '../billing/storeCopy';
import type { BillingPlatform, StoreProduct } from '../billing/types';
import {
  COSMETIC_SHOP_LINE,
  EARNED_OUTFIT_IDS,
  SHOP_PACKS,
  cosmeticPriceString,
  everythingIncludesLine,
  everythingOwnedLine,
  everythingSavingLabel,
  getOutfit,
  milestoneCurrent,
  type ShopPack,
} from '../game/outfits';
import { milestoneStatsOf, outfitOwned, packOwned } from '../game/shop';
import type { SaveData } from '../game/storage';

function earnedProgress(save: SaveData, id: (typeof EARNED_OUTFIT_IDS)[number]): string {
  const outfit = getOutfit(id);
  if (!outfit?.milestone) return '';
  const current = milestoneCurrent(milestoneStatsOf(save), outfit.milestone);
  const shown = Math.min(Math.max(0, current), outfit.milestone.target);
  return `${shown}/${outfit.milestone.target} ${outfit.milestone.label}`;
}

export function ShopPacks({
  save,
  products,
  platform,
  busy,
  message,
  focusOutfit,
  onSelectOutfit,
  onPreviewPack,
  onWearOutfit,
  onPurchasePack,
  onRestore,
}: {
  save: SaveData;
  products: readonly StoreProduct[];
  platform: BillingPlatform;
  busy: boolean;
  message: string | null;
  focusOutfit: string | null;
  onSelectOutfit: (id: string) => void;
  onPreviewPack: (outfitId: string | null, bootId: string | null) => void;
  onWearOutfit: (id: string | null) => boolean;
  onPurchasePack: (productId: string) => void;
  onRestore: () => void;
}) {
  const previewPack = (pack: ShopPack) => {
    const outfitId = pack.outfitIds[0] ?? null;
    const bootId = pack.bootIds[0] ?? null;
    if (!outfitId && !bootId) return;
    onPreviewPack(outfitId, bootId);
  };

  return (
    <div className="shop-packs">
      <p className="shop-lead">{COSMETIC_SHOP_LINE}</p>
      <section className="shop-section" aria-label="Earned in play">
        <h3>EARNED IN PLAY</h3>
        <div className="shop-list">
          {EARNED_OUTFIT_IDS.map((id) => {
            const outfit = getOutfit(id);
            if (!outfit) return null;
            const owned = outfitOwned(save, id);
            const equipped = save.equippedOutfit === id;
            const label = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : 'LOCKED';
            return (
              <div key={id} className={`shop-item ${focusOutfit === id ? 'focus' : ''} ${equipped ? 'on' : ''}`}>
                <button type="button" className="shop-item-main" onClick={() => onSelectOutfit(id)}>
                  <i style={{ background: outfit.clothing.shirt, boxShadow: `inset 0 -6px 0 ${outfit.clothing.shorts}` }} />
                  <span>
                    <b>{outfit.name}</b>
                    <em>Earned in play</em>
                    <small>{earnedProgress(save, id)}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn ghost shop-action"
                  disabled={!owned || equipped}
                  onClick={() => { onSelectOutfit(id); onWearOutfit(id); }}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="shop-section" aria-label="Packs">
        <h3>PACKS</h3>
        <div className="shop-list">
          {SHOP_PACKS.map((pack) => {
            const owned = packOwned(save, pack.id);
            const price = cosmeticPriceString(pack.productId, products);
            const label = packButtonLabel(platform, price, busy, owned);
            const detail = pack.id === 'everything' ? everythingIncludesLine() : pack.blurb;
            const ownedLine = pack.id === 'everything' ? everythingOwnedLine(save.ownedPacks) : null;
            const saving = pack.id === 'everything' ? everythingSavingLabel(products) : null;
            return (
              <div key={pack.id} className="shop-item">
                <button type="button" className="shop-item-main" onClick={() => previewPack(pack)}>
                  <i className={`pack-swatch pack-${pack.id}`} />
                  <span>
                    <b>{pack.name}</b>
                    <em>Cosmetic pack</em>
                    <small>{detail}</small>
                    {ownedLine && <small>{ownedLine}</small>}
                    {saving && <small>{saving}</small>}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn ghost shop-action pack-price"
                  disabled={owned || busy}
                  onClick={() => onPurchasePack(pack.productId)}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn ghost" disabled={busy} onClick={onRestore}>
          RESTORE PURCHASES
        </button>
        {message && <p className="shop-note" role="status">{message}</p>}
      </section>
    </div>
  );
}

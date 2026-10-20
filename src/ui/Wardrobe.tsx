import { useMemo, useState } from 'react';
import {
  CLOTHING_SWATCHES,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  type Appearance,
  type HairStyle,
  type PlayerBody,
} from '../game/appearance';
import {
  BOOTS,
  KITS,
  LAUNCH_COLLECTION_ITEM_IDS,
  challengeLabel,
  type BootDesign,
  type KitDesign,
} from '../game/catalogue';
import type { BillingPlatform, StoreProduct } from '../billing/types';
import { LAUNCH_COLLECTION_DISPLAY_NAME } from '../billing/config';
import { launchCollectionBlurb, launchPurchaseLabel, launchStoreNote } from '../billing/storeCopy';
import { DANCES, dancePriceString, type DanceDesign } from '../game/dances';
import { challengeValue, meetsChallenge } from '../game/shop';
import { composePlayerSkin } from '../game/skins';
import type { SaveData } from '../game/storage';
import { PlayerPreview } from './PlayerPreview';

type ShopTab = 'boots' | 'kits' | 'dances';

function SwatchRow({
  colours,
  value,
  onPick,
  label,
}: {
  colours: readonly string[];
  value: string;
  onPick: (c: string) => void;
  label: string;
}) {
  return (
    <div className="group">
      <label>{label}</label>
      <div className="swatch-row" role="listbox" aria-label={label}>
        {colours.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${value.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={c}
            aria-selected={value.toLowerCase() === c.toLowerCase()}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

export function BodySelect({ onChoose }: { onChoose: (body: PlayerBody) => void }) {
  return (
    <div className="screen settings body-select">
      <div className="card">
        <h2>YOUR FOOTBALLER</h2>
        <p className="shop-lead">Pick a male or female player. Both are free, and you can change this later in Customise.</p>
        <button type="button" className="btn primary big" onClick={() => onChoose('male')}>MALE</button>
        <button type="button" className="btn ghost" onClick={() => onChoose('female')}>FEMALE</button>
      </div>
    </div>
  );
}

export function CustomiseScreen({
  save,
  onChange,
  onBody,
  onClose,
}: {
  save: SaveData;
  onChange: (a: Appearance) => void;
  onBody: (body: PlayerBody) => void;
  onClose: () => void;
}) {
  const a = save.appearance;
  const hairStyles = HAIR_STYLES.map((h) => (
    h.id === 'short' && a.body === 'female' ? { ...h, label: 'Ponytail' } : h
  ));
  const skin = useMemo(
    () => composePlayerSkin(a, save.equippedKit, save.equippedBoot),
    [a, save.equippedKit, save.equippedBoot],
  );

  const patch = (p: Partial<Appearance>) => {
    onChange({
      ...a,
      ...p,
      clothing: { ...a.clothing, ...p.clothing },
    });
  };

  return (
    <div className="screen settings wardrobe">
      <div className="card wardrobe-card">
        <h2>CUSTOMISE</h2>
        <p className="shop-lead">Free looks — footballer, skin, hair and basic colours. Shop kits never change your face or hair.</p>
        <PlayerPreview skin={skin} closeUp label="Customise preview" />
        <div className="group">
          <label>Footballer</label>
          <div className="seg" role="listbox" aria-label="Footballer">
            {(['male', 'female'] as const).map((body) => (
              <button
                key={body}
                type="button"
                className={a.body === body ? 'on' : ''}
                aria-selected={a.body === body}
                onClick={() => onBody(body)}
              >
                {body === 'male' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>
          <p className="shop-note">Both footballers are free. Kit colours, numbers and hair colours work on either.</p>
        </div>
        <SwatchRow label="Skin tone" colours={SKIN_TONES} value={a.skinTone} onPick={(skinTone) => patch({ skinTone })} />
        <SwatchRow label="Hair colour" colours={HAIR_COLORS} value={a.hairColor} onPick={(hairColor) => patch({ hairColor })} />
        <div className="group">
          <label>Hair style</label>
          <div className="seg wrap">
            {hairStyles.map((h) => (
              <button
                key={h.id}
                type="button"
                className={a.hairStyle === h.id ? 'on' : ''}
                onClick={() => patch({ hairStyle: h.id as HairStyle })}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
        <SwatchRow label="Shirt" colours={CLOTHING_SWATCHES} value={a.clothing.shirt} onPick={(shirt) => patch({ clothing: { ...a.clothing, shirt } })} />
        <SwatchRow label="Shorts" colours={CLOTHING_SWATCHES} value={a.clothing.shorts} onPick={(shorts) => patch({ clothing: { ...a.clothing, shorts } })} />
        <p className="shop-note">Clothing swatches apply when you want a free look. Equipped shop kits override shirt/shorts/socks colours in play.</p>
        <button type="button" className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

function DanceRow({
  dance,
  save,
  focused,
  onFocus,
  onEquip,
}: {
  dance: DanceDesign;
  save: SaveData;
  focused: boolean;
  onFocus: () => void;
  onEquip: () => void;
}) {
  const owned = save.ownedDances.includes(dance.id);
  const equipped = save.equippedDance === dance.id;
  const price = dancePriceString(dance, []);
  return (
    <div className={`shop-item ${focused ? 'focus' : ''} ${equipped ? 'on' : ''}`}>
      <button type="button" className="shop-item-main" onClick={onFocus}>
        <i className={`dance-swatch dance-${dance.id}`} />
        <span>
          <b>{dance.name}</b>
          <em>Cosmetic · {dance.milestone === 0 ? 'Starter' : `Milestone ${dance.milestone}`}</em>
          <small>{dance.note}</small>
          {price && <small className="dance-price">{price}</small>}
        </span>
      </button>
      <button
        type="button"
        className="btn ghost shop-action"
        disabled={equipped || !owned}
        onClick={onEquip}
      >
        {equipped ? 'EQUIPPED' : owned ? 'EQUIP' : 'LOCKED'}
      </button>
    </div>
  );
}

function UnlockHint({ item, save }: { item: BootDesign | KitDesign; save: SaveData }) {
  const owned = 'main' in item
    ? save.ownedBoots.includes(item.id)
    : save.ownedKits.includes(item.id);
  if (owned || item.unlock.price === 0) return null;
  const progress = challengeValue(save.challenges, item.unlock.challenge);
  const need = item.unlock.challengeTarget;
  const challengeOk = meetsChallenge(save.challenges, item.unlock);
  return (
    <small className="unlock-hint">
      {item.unlock.price.toLocaleString()} coins
      {item.unlock.challenge !== 'none' && (
        <> · {challengeLabel(item.unlock.challenge)} {Math.min(progress, need)}/{need}{challengeOk ? ' ✓' : ''}</>
      )}
    </small>
  );
}

export function ShopScreen({
  save,
  launchProduct,
  billingPlatform,
  billingMessage,
  billingBusy,
  onBuyBoot,
  onBuyKit,
  onEquipDance,
  onPurchaseLaunch,
  onRestorePurchases,
  onPreview,
  onClose,
}: {
  save: SaveData;
  launchProduct: StoreProduct | null;
  billingPlatform: BillingPlatform;
  billingMessage: string | null;
  billingBusy: boolean;
  onBuyBoot: (id: string) => boolean;
  onBuyKit: (id: string) => boolean;
  onEquipDance: (id: string) => boolean;
  onPurchaseLaunch: () => void;
  onRestorePurchases: () => void;
  onPreview: (opts: { kitId?: string | null; bootId?: string | null }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ShopTab>('boots');
  const [focusBoot, setFocusBoot] = useState(save.equippedBoot);
  const [focusKit, setFocusKit] = useState(save.equippedKit);
  const [focusDance, setFocusDance] = useState(save.equippedDance);
  const priceLabel = launchProduct?.priceString ?? null;
  const ownedLaunch = save.launchCollectionOwned;
  const storeNote = launchStoreNote(billingPlatform, !!priceLabel);

  const previewSkin = useMemo(
    () => composePlayerSkin(save.appearance, focusKit, focusBoot),
    [save.appearance, focusKit, focusBoot],
  );

  const selectBoot = (boot: BootDesign) => {
    setFocusBoot(boot.id);
    onPreview({ bootId: boot.id, kitId: focusKit });
  };
  const selectKit = (kit: KitDesign) => {
    setFocusKit(kit.id);
    onPreview({ kitId: kit.id, bootId: focusBoot });
  };

  return (
    <div className="screen settings wardrobe">
      <div className="card wardrobe-card shop-card">
        <h2>SHOP</h2>
        <p className="shop-lead">
          Boots and kits are cosmetic only — they never widen timing or boost scores.
          Coins come from your runs. Challenges are lifetime play totals.
        </p>
        <div className="economy-row">
          <span className="best-pill">COINS <b>{save.coins.toLocaleString()}</b></span>
          <span className="best-pill ghost">BEST SCORE <b>{save.best}</b></span>
        </div>
        <div className="launch-card">
          <h3>{LAUNCH_COLLECTION_DISPLAY_NAME}</h3>
          <p>{launchCollectionBlurb(LAUNCH_COLLECTION_ITEM_IDS.length)}</p>
          {ownedLaunch ? (
            <p className="coin-earn">OWNED · restored with your store account</p>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={billingBusy}
              onClick={onPurchaseLaunch}
            >
              {launchPurchaseLabel(billingPlatform, priceLabel, billingBusy)}
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            disabled={billingBusy}
            onClick={onRestorePurchases}
          >
            RESTORE PURCHASES
          </button>
          {billingMessage && <p className="shop-note" role="status">{billingMessage}</p>}
          {storeNote && <p className="shop-note">{storeNote}</p>}
        </div>
        <PlayerPreview
          skin={previewSkin}
          label="Shop preview"
          dance={tab === 'dances' ? focusDance : null}
        />
        <div className="seg">
          <button type="button" className={tab === 'boots' ? 'on' : ''} onClick={() => setTab('boots')}>BOOTS</button>
          <button type="button" className={tab === 'kits' ? 'on' : ''} onClick={() => setTab('kits')}>KITS</button>
          <button type="button" className={tab === 'dances' ? 'on' : ''} onClick={() => setTab('dances')}>DANCES</button>
        </div>
        <div className="shop-list">
          {tab === 'boots' && BOOTS.map((boot) => {
            const owned = save.ownedBoots.includes(boot.id);
            const equipped = save.equippedBoot === boot.id;
            const challengeOk = meetsChallenge(save.challenges, boot.unlock);
            const afford = owned || (challengeOk && save.coins >= boot.unlock.price);
            const label = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : afford ? `BUY ${boot.unlock.price}` : 'LOCKED';
            return (
              <div key={boot.id} className={`shop-item ${focusBoot === boot.id ? 'focus' : ''} ${equipped ? 'on' : ''}`}>
                <button type="button" className="shop-item-main" onClick={() => selectBoot(boot)}>
                  <i style={{ background: boot.main, boxShadow: `inset 0 -6px 0 ${boot.sole}` }} />
                  <span>
                    <b>{boot.name}</b>
                    <em>{boot.theme} · {boot.pattern}</em>
                    <small>{boot.note}</small>
                    <UnlockHint item={boot} save={save} />
                  </span>
                </button>
                <button
                  type="button"
                  className="btn ghost shop-action"
                  disabled={equipped || (!owned && !afford)}
                  onClick={() => { selectBoot(boot); onBuyBoot(boot.id); }}
                >
                  {label}
                </button>
              </div>
            );
          })}
          {tab === 'kits' && KITS.map((kit) => {
            const owned = save.ownedKits.includes(kit.id);
            const equipped = save.equippedKit === kit.id;
            const challengeOk = meetsChallenge(save.challenges, kit.unlock);
            const afford = owned || (challengeOk && save.coins >= kit.unlock.price);
            const label = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : afford ? `BUY ${kit.unlock.price}` : 'LOCKED';
            return (
              <div key={kit.id} className={`shop-item ${focusKit === kit.id ? 'focus' : ''} ${equipped ? 'on' : ''}`}>
                <button type="button" className="shop-item-main" onClick={() => selectKit(kit)}>
                  <i style={{ background: kit.clothing.shirt, boxShadow: `inset 0 -6px 0 ${kit.clothing.shorts}` }} />
                  <span>
                    <b>{kit.name}</b>
                    <em>{kit.theme} · {kit.pattern}</em>
                    <small>{kit.note}</small>
                    <UnlockHint item={kit} save={save} />
                  </span>
                </button>
                <button
                  type="button"
                  className="btn ghost shop-action"
                  disabled={equipped || (!owned && !afford)}
                  onClick={() => { selectKit(kit); onBuyKit(kit.id); }}
                >
                  {label}
                </button>
              </div>
            );
          })}
          {tab === 'dances' && DANCES.map((dance) => (
            <DanceRow
              key={dance.id}
              dance={dance}
              save={save}
              focused={focusDance === dance.id}
              onFocus={() => setFocusDance(dance.id)}
              onEquip={() => { setFocusDance(dance.id); onEquipDance(dance.id); }}
            />
          ))}
        </div>
        <button type="button" className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

import { useMemo, useState, type CSSProperties } from 'react';
import {
  KIT_COLOURS,
  clothingFor,
  getKitColour,
  kitTileLabel,
  type KitColour,
  type KitPattern,
} from '../game/kitColours';
import { composePlayerSkin } from '../game/skins';
import type { SaveData } from '../game/storage';
import { PlayerPreview } from './PlayerPreview';

function swatchStyle(option: KitColour): CSSProperties {
  const main = option.shirt;
  const second = option.secondary;
  const pattern: KitPattern = option.pattern;
  switch (pattern) {
    case 'plain':
      return { background: main };
    case 'halves':
      return { background: `linear-gradient(90deg, ${main} 50%, ${second} 50%)` };
    case 'hoops':
      return { background: `repeating-linear-gradient(${main} 0 7px, ${second} 7px 14px)` };
    case 'stripes':
      return { background: `repeating-linear-gradient(90deg, ${main} 0 7px, ${second} 7px 14px)` };
    case 'sash':
      return { background: `linear-gradient(115deg, ${main} 36%, ${second} 36% 64%, ${main} 64%)` };
    case 'chevron':
      return {
        background: `linear-gradient(135deg, transparent 42%, ${second} 42% 58%, transparent 58%), linear-gradient(45deg, transparent 42%, ${second} 42% 58%, transparent 58%), ${main}`,
      };
    case 'sleeves':
      return { background: `linear-gradient(90deg, ${second} 22%, ${main} 22% 78%, ${second} 78%)` };
    default: {
      const neverPattern: never = pattern;
      return { background: neverPattern };
    }
  }
}

export function KitColoursScreen({
  save,
  onPick,
  onClose,
}: {
  save: SaveData;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(save.appearance.kitColourId);
  const look = getKitColour(pending);
  const previewSkin = useMemo(() => {
    if (!look) return composePlayerSkin(save.appearance);
    return composePlayerSkin({
      ...save.appearance,
      kitColourId: look.id,
      clothing: clothingFor(look),
    });
  }, [look, save.appearance]);
  const previewName = look?.label ?? 'Neutral';

  return (
    <div className="screen settings kit-picker">
      <div className="card kit-card">
        <h2>Choose your kit</h2>
        <PlayerPreview skin={previewSkin} label={previewName} />
        <p className="kit-preview-name">{previewName}</p>
        <p className="kit-preview-note">Saved on this device.</p>
        <div className="kit-grid" role="listbox" aria-label="Choose your kit">
          {KIT_COLOURS.map((option) => {
            const on = option.id === pending;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                className={`kit-tile${on ? ' on' : ''}`}
                aria-selected={on}
                aria-label={option.label}
                onClick={() => setPending(option.id)}
              >
                <i className="kit-swatch" style={swatchStyle(option)} aria-hidden="true" />
                <span>{kitTileLabel(option)}</span>
                {on && <span className="kit-tick" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="kit-use"
          onClick={() => {
            if (look) onPick(look.id);
            onClose();
          }}
        >
          Use these colours
        </button>
      </div>
    </div>
  );
}

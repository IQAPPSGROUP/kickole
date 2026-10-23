import { useMemo, useState, type CSSProperties } from 'react';
import {
  KIT_REGIONS,
  clothingFor,
  filterKits,
  getKitColour,
  kitTileLabel,
  type KitColour,
  type KitPattern,
  type KitTab,
} from '../game/kitColours';
import { composePlayerSkin } from '../game/skins';
import type { SaveData } from '../game/storage';
import { PlayerPreview } from './PlayerPreview';

const TABS: readonly { id: KitTab; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  ...KIT_REGIONS.map((region) => ({ id: region, label: region })),
];

function swatchStyle(option: KitColour): CSSProperties {
  const bands = option.trimBands;
  const trim = bands.map((color, index) => {
    const start = 72 + (index * 28) / bands.length;
    const end = 72 + ((index + 1) * 28) / bands.length;
    return `${color} ${start}% ${end}%`;
  }).join(', ');
  const pattern: KitPattern = option.pattern;
  switch (pattern) {
    case 'plain':
      return { backgroundImage: `linear-gradient(to bottom, ${option.shirt} 0 72%, ${trim})` };
    case 'stripes':
      return {
        backgroundImage: `linear-gradient(to bottom, transparent 0 72%, ${trim}), repeating-linear-gradient(90deg, ${option.shirt} 0 5px, ${option.secondary} 5px 10px)`,
      };
    default: {
      const neverPattern: never = pattern;
      return { backgroundImage: neverPattern };
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
  const [tab, setTab] = useState<KitTab>('popular');
  const [query, setQuery] = useState('');
  const look = getKitColour(pending);
  const options = useMemo(() => filterKits(tab, query), [tab, query]);
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
        <input
          className="kit-search"
          value={query}
          aria-label="Search kits"
          placeholder="Search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="kit-tabs" role="tablist" aria-label="Kit regions">
          {TABS.map((item) => {
            const on = item.id === tab && query.trim() === '';
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={`kit-tab${on ? ' on' : ''}`}
                onClick={() => {
                  setTab(item.id);
                  setQuery('');
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="kit-scroll">
          <div className="kit-grid" role="listbox" aria-label="Choose your kit">
            {options.map((option) => {
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
          {options.length === 0 && (
            <p className="kit-preview-note">{query.trim() ? 'No kit matches.' : 'No kits in this list yet.'}</p>
          )}
        </div>
        <button
          type="button"
          className="kit-use"
          onClick={() => {
            if (look) onPick(look.id);
            onClose();
          }}
        >
          Use this kit
        </button>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  KIT_COLOURS,
  getKitColour,
  type KitColour,
  type KitKind,
} from '../game/kitColours';
import type { SaveData } from '../game/storage';

function groupLabel(kind: KitKind): string {
  switch (kind) {
    case 'neutral':
      return 'Neutral';
    case 'nation':
      return 'Kits';
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

function ColourChips({ option }: { option: KitColour }) {
  return (
    <span className="kit-chips" aria-hidden="true">
      {option.colours.map((colour, index) => <i key={`${option.id}-${index}`} style={{ background: colour }} />)}
    </span>
  );
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
  const [query, setQuery] = useState('');
  const selected = save.appearance.kitColourId;
  const current = getKitColour(selected);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => KIT_COLOURS.filter((option) => option.label.toLowerCase().includes(needle)),
    [needle],
  );
  const kinds: KitKind[] = ['neutral', 'nation'];

  return (
    <div className="screen settings wardrobe">
      <div className="card wardrobe-card kit-card">
        <h2>Choose your kit</h2>
        <p className="shop-lead">
          Plain blocks, stripes, hoops, halves or a sash. Flag colours only. No crests, badges or sponsors.
        </p>
        <p className="shop-note">Saved on this device. Neutral is the default.</p>
        {!current && <p className="shop-note">Saved colours stay on the kit until you pick one from the list.</p>}
        <label className="kit-search-label" htmlFor="kit-colour-search">Find a kit</label>
        <input
          id="kit-colour-search"
          className="kit-search"
          value={query}
          placeholder="Name"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="kit-list" role="listbox" aria-label="Choose your kit">
          {kinds.map((kind) => {
            const rows = visible.filter((option) => option.kind === kind);
            if (rows.length === 0) return null;
            return (
              <div key={kind} className="kit-group">
                <h3>{groupLabel(kind)}</h3>
                {rows.map((option) => {
                  const on = option.id === selected;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      className={`kit-row${on ? ' on' : ''}`}
                      aria-selected={on}
                      onClick={() => onPick(option.id)}
                    >
                      <ColourChips option={option} />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {visible.length === 0 && <p className="shop-note">No kit matches that name.</p>}
        </div>
        <button type="button" className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

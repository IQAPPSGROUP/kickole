import { useMemo, useState } from 'react';
import {
  KIT_COLOURS,
  getKitColour,
  type KitColour,
  type KitColourGroup,
} from '../game/kitColours';
import type { SaveData } from '../game/storage';

function groupLabel(group: KitColourGroup): string {
  switch (group) {
    case 'neutral':
      return 'Neutral';
    case 'country':
      return 'Countries';
    default: {
      const neverGroup: never = group;
      return neverGroup;
    }
  }
}

function ColourChips({ option }: { option: KitColour }) {
  const chips = [
    ['shirt', option.clothing.shirt],
    ['shorts', option.clothing.shorts],
    ['socks', option.clothing.socks],
  ] as const;
  return (
    <span className="kit-chips" aria-hidden="true">
      {chips.map(([part, colour]) => <i key={part} style={{ background: colour }} />)}
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
    () => KIT_COLOURS.filter((option) => option.name.toLowerCase().includes(needle)),
    [needle],
  );
  const groups: KitColourGroup[] = ['neutral', 'country'];

  return (
    <div className="screen settings wardrobe">
      <div className="card wardrobe-card kit-card">
        <h2>KIT COLOURS</h2>
        <p className="shop-lead">
          Plain shirt, shorts and socks. Pick a country or a neutral kit. No crests, badges, flags or sponsors.
        </p>
        <p className="shop-note">Saved on this device. Neutral is the default. The basic football kit uses these colours.</p>
        {save.equippedOutfit && (
          <p className="shop-note">A costume is covering the kit. These colours show when the football kit is on.</p>
        )}
        {!current && <p className="shop-note">Saved colours stay on the kit until you pick one from the list.</p>}
        <label className="kit-search-label" htmlFor="kit-colour-search">Find a kit</label>
        <input
          id="kit-colour-search"
          className="kit-search"
          value={query}
          placeholder="Country or neutral"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="kit-list" role="listbox" aria-label="Kit colours">
          {groups.map((group) => {
            const rows = visible.filter((option) => option.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} className="kit-group">
                <h3>{groupLabel(group)}</h3>
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
                      <span>{option.name}</span>
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

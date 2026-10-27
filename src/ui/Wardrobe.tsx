import { useMemo } from 'react';
import {
  HAIR_COLORS,
  SKIN_TONES,
  type Appearance,
  type PlayerBody,
} from '../game/appearance';
import { getKitColour } from '../game/kitColours';
import { kitLookNote } from '../game/kitLookNote';
import { composePlayerSkin } from '../game/skins';
import type { SaveData } from '../game/storage';
import { PlayerPreview } from './PlayerPreview';

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
        <p className="panel-lead">Pick a male or female player. You can change this later in Customise.</p>
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
  onKitColours,
  onClose,
}: {
  save: SaveData;
  onChange: (a: Appearance) => void;
  onBody: (body: PlayerBody) => void;
  onKitColours: () => void;
  onClose: () => void;
}) {
  const a = save.appearance;
  const kit = getKitColour(a.kitColourId);
  const skin = useMemo(() => composePlayerSkin(a), [a]);

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
        <p className="panel-lead">Pick a footballer, then skin and hair. Your kit stays on this device.</p>
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
          <p className="panel-note">Hair colours work on either player.</p>
        </div>
        <SwatchRow label="Skin tone" colours={SKIN_TONES} value={a.skinTone} onPick={(skinTone) => patch({ skinTone })} />
        <SwatchRow label="Hair colour" colours={HAIR_COLORS} value={a.hairColor} onPick={(hairColor) => patch({ hairColor })} />
        <div className="group">
          <label>Kit</label>
          <button type="button" className="btn ghost" onClick={onKitColours}>
            {kit?.label ?? 'Choose your kit'}
          </button>
          <p className="panel-note">{kit ? kitLookNote(kit) : 'Saved on this device.'}</p>
        </div>
        <button type="button" className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

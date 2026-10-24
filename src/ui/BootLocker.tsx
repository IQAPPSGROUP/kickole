import { useEffect, useRef } from 'react';
import {
  BOOT_LOCKED,
  BOOT_STYLES,
  type BootStyle,
  type BootStyleId,
} from '../game/bootStyles';
import type { BootToast } from '../game/controller';
import type { SaveData } from '../game/storage';

function BootMark({ style, locked }: { style: BootStyle; locked: boolean }) {
  const main = locked ? BOOT_LOCKED : style.main;
  const dark = locked ? BOOT_LOCKED : style.dark;
  const light = locked ? BOOT_LOCKED : style.light;
  const id: BootStyleId = style.id;
  switch (id) {
    case 'boot-classic':
    case 'boot-gold':
      return (
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <path d="M10 58c0-14 12-22 26-22h10c3-8 12-12 20-10l4 14c16 3 32 8 40 14 3 4 1 10-6 12H16c-4 0-6-4-6-8z" fill={main} />
          <rect x="10" y="64" width="98" height="8" rx="3" fill={dark} />
        </svg>
      );
    case 'boot-wellies':
      return (
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <path d="M28 6h32v40c18 2 38 8 46 16 3 4 1 10-6 12H26C24 62 26 28 28 6z" fill={main} />
          <rect x="26" y="6" width="36" height="6" rx="2" fill={dark} />
          <rect x="22" y="68" width="86" height="7" rx="3" fill={dark} />
        </svg>
      );
    case 'boot-cowboy':
      return (
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <path d="M24 8l16 8 18-8v36c20 2 40 8 52 20l-16 4H40v8H24V8z" fill={main} />
          <rect x="24" y="64" width="16" height="10" fill={dark} />
        </svg>
      );
    case 'boot-hitops':
      return (
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <path d="M26 16h36l2 28c18 2 36 8 42 14 2 3 0 6-4 6H24V16z" fill={main} />
          <path d="M18 62h92c2 6 0 12-6 12H22c-4 0-4-8-4-12z" fill={dark} />
        </svg>
      );
    case 'boot-snow':
      return (
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <path d="M26 24h34v20c18 2 38 8 44 16 2 4 0 6-4 6H24V24z" fill={main} />
          <rect x="24" y="16" width="40" height="10" rx="4" fill={light} />
          <rect x="18" y="64" width="90" height="8" fill={dark} />
        </svg>
      );
    case 'boot-space':
      return (
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <path d="M22 18c0-8 40-8 42 0v28c20 0 40 8 42 18 0 8-8 10-16 10H26c-8 0-10-6-8-14 2-10 4-28 4-42z" fill={main} />
          <rect x="16" y="66" width="96" height="8" rx="3" fill={dark} />
        </svg>
      );
    case 'boot-knight':
      return (
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <path d="M26 8h34v44c16 2 36 6 50 16H26V8z" fill={main} />
          <rect x="24" y="68" width="78" height="6" rx="2" fill={dark} />
        </svg>
      );
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

function Padlock() {
  return (
    <svg className="boot-lock" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function BootLocker({
  save,
  onEquip,
  onClose,
}: {
  save: SaveData;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="screen settings boot-locker">
      <div className="card boot-card">
        <h2>Your boots</h2>
        <p className="panel-lead">Earn new boots by playing. Nothing to buy.</p>
        <div className="boot-grid">
          {BOOT_STYLES.map((style) => {
            const locked = !save.ownedBoots.includes(style.id);
            const on = save.equippedBoot === style.id;
            const status = locked ? style.hint : style.id === 'boot-classic' ? 'Starter' : 'Unlocked';
            return (
              <button
                key={style.id}
                type="button"
                className={`boot-card-item${locked ? ' locked' : ''}${on ? ' on' : ''}`}
                aria-disabled={locked}
                aria-pressed={on}
                aria-label={`${style.name}. ${status}`}
                onClick={() => {
                  if (!locked) onEquip(style.id);
                }}
              >
                <BootMark style={style} locked={locked} />
                <span className="boot-name">{style.name}</span>
                <span className="boot-hint">{status}</span>
                {locked ? <Padlock /> : <span className="boot-tick" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
        <button type="button" className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

export function BootUnlockToast({
  toast,
  onDone,
}: {
  toast: BootToast;
  onDone: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), 2800);
    return () => window.clearTimeout(timer);
  }, [toast.id]);
  return (
    <div className="boot-toast" role="status">{toast.text}</div>
  );
}

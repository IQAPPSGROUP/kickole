import type { TimingConfig } from '../engine/config';
import type { Boot } from './boots';

/** A sun shower trims 8% off whatever window the boots have already widened. */
export const SHOWER_TIGHTEN = 0.08;

/** Combo length that starts the shower. */
export const SHOWER_STREAK = 8;

/** Seconds the tighter window lasts if the combo holds. */
export const SHOWER_SECONDS = 4.5;

type BootLeeway = Pick<Boot, 'perfectExtra' | 'goodExtra' | 'poorExtra'>;

/** Boots add a few milliseconds. They never replace the base constants. */
export function widenedWindows(base: TimingConfig, boot: BootLeeway): TimingConfig {
  return {
    perfectMs: base.perfectMs + boot.perfectExtra,
    goodMs: base.goodMs + boot.goodExtra,
    poorMs: base.poorMs + boot.poorExtra,
  };
}

export function showerWindows(windows: TimingConfig): TimingConfig {
  const scale = 1 - SHOWER_TIGHTEN;
  return {
    perfectMs: windows.perfectMs * scale,
    goodMs: windows.goodMs * scale,
    poorMs: windows.poorMs * scale,
  };
}

/**
 * Compose rule: add the boot's leeway, then multiply by the shower if it is active.
 * A shower on a better boot is stricter than that boot alone, and still wider than a shower
 * on the starter pair (which adds nothing before the multiply).
 */
export function composeWindows(base: TimingConfig, boot: BootLeeway, shower: boolean): TimingConfig {
  const widened = widenedWindows(base, boot);
  return shower ? showerWindows(widened) : widened;
}

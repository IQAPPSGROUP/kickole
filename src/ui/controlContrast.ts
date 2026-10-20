import { contrastRatio } from './menuContrast';

/** Home CUSTOMISE / SHOP / SETTINGS. Cream on a solid navy fill. */
export const MENU_BUTTON_TEXT = '#F7F5ED';
export const MENU_BUTTON_FILL = '#102830';
export const MENU_BUTTON_BORDER = '#F7F5ED';

/** L / R foot controls. Yellow mark and cream label on the same navy fill. */
export const FOOT_MARK = '#FFFFFF';
export const FOOT_LABEL = '#FFFFFF';
export const FOOT_FILL = '#102830';
export const FOOT_BORDER = '#F7F5ED';

/** Tutorial cue sitting above a trick button. Navy on cream, so it still reads on a yellow chip. */
export const CUE_TEXT = '#102830';
export const CUE_FILL = '#F7F5ED';

/** Trick chips. White type on solid saturated fills, including while a trick is still locked. */
export const TRICK_BORDER = '#F7F5ED';
export const TRICK_TEXT = '#FFFFFF';

export const TRICK_BUTTONS = [
  { name: 'head', text: TRICK_TEXT, fill: '#B91C1C' },
  { name: 'groove', text: TRICK_TEXT, fill: '#9A3412' },
  { name: 'atw', text: TRICK_TEXT, fill: '#5B21B6' },
  { name: 'neck', text: TRICK_TEXT, fill: '#9D174D' },
  { name: 'flick', text: TRICK_TEXT, fill: '#C2410C' },
  { name: 'thigh', text: TRICK_TEXT, fill: '#0F766E' },
] as const;

export function controlContrast(text: string, fill: string): number {
  return contrastRatio(text, fill);
}

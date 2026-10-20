import { contrastRatio } from './menuContrast';

/** Home CUSTOMISE / SHOP / SETTINGS. Cream on a solid navy fill. */
export const MENU_BUTTON_TEXT = '#F7F5ED';
export const MENU_BUTTON_FILL = '#102830';
export const MENU_BUTTON_BORDER = '#F7F5ED';

/** L / R foot controls. Yellow mark and cream label on the same navy fill. */
export const FOOT_MARK = '#FFD93D';
export const FOOT_LABEL = '#F7F5ED';
export const FOOT_FILL = '#102830';
export const FOOT_BORDER = '#F7F5ED';

/** Tutorial cue sitting above a trick button. Navy on cream, so it still reads on a yellow chip. */
export const CUE_TEXT = '#102830';
export const CUE_FILL = '#F7F5ED';

/** Trick chips. Light outline is shared; each fill keeps its own text colour. */
export const TRICK_BORDER = '#F7F5ED';

export const TRICK_BUTTONS = [
  { name: 'head', text: '#102830', fill: '#FFD93D' },
  { name: 'groove', text: '#102830', fill: '#FFD93D' },
  { name: 'atw', text: '#F8F9FB', fill: '#4A33B5' },
  { name: 'neck', text: '#102830', fill: '#FF4F9A' },
  { name: 'flick', text: '#102830', fill: '#FF8A5B' },
  { name: 'thigh', text: '#F8F9FB', fill: '#0A6E66' },
] as const;

export function controlContrast(text: string, fill: string): number {
  return contrastRatio(text, fill);
}

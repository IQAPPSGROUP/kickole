/** Menu type that sits on the bright sky. The scrim is what the contrast test measures. */
export const MENU_LABEL = '#f5c94d';
export const MENU_TAGLINE = '#f7e9c5';
export const MENU_SCRIM = '#0c1620';
export const MENU_SCRIM_ALPHA = 0.8;
export const MENU_SCRIM_CSS = 'rgba(12, 22, 32, 0.8)';

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
}

function linearize(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const red = linearize(channel(hex, 0));
  const green = linearize(channel(hex, 1));
  const blue = linearize(channel(hex, 2));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function compositeChannel(foreground: number, background: number, alpha: number): number {
  return Math.round(foreground * alpha + background * (1 - alpha));
}

/** Scrim painted over a worst-case white sky, as #rrggbb. */
export function scrimOverWhite(): string {
  const parts = [0, 1, 2].map((index) => {
    const value = compositeChannel(channel(MENU_SCRIM, index) * 255, 255, MENU_SCRIM_ALPHA);
    return value.toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

/** WCAG contrast ratio. 4.5 is the body-text minimum. */
export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function menuTextContrast(text: string): number {
  return contrastRatio(text, scrimOverWhite());
}

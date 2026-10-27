import type { KitColour, KitPattern } from './kitColours';

/** Customise helper. The same sentence for every kit. */
export const KIT_HELPER_NOTE = 'Pick a colour for your shirt. Bands use the flag colours.';

export function kitHelperNote(kit: KitColour): string {
  const pattern: KitPattern = kit.pattern;
  switch (pattern) {
    case 'plain':
    case 'stripes':
      return KIT_HELPER_NOTE;
    default: {
      const unexpected: never = pattern;
      return unexpected;
    }
  }
}

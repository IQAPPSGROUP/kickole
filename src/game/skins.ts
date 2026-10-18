export interface Skin {
  id: string;
  name: string;
  clothing: { shirt: string; shirtTrim: string; shorts: string; socks: string };
  boots: { main: string; sole: string };
  body: { skin: string; hair: string };
  football: { base: string; panels: string };
  unlocked: boolean;
  /** Reserved for a future in-app purchase; unused in v0.1. */
  productId: string | null;
}

/** Skins are cosmetic only: physics and scoring never read this data. */
export const SKINS: Skin[] = [
  {
    id: 'kicky-teal',
    name: 'Kicky Teal',
    clothing: { shirt: '#12BFA6', shirtTrim: '#F7F5ED', shorts: '#142D35', socks: '#12BFA6' },
    boots: { main: '#EAF44A', sole: '#142D35' },
    body: { skin: '#E8B48F', hair: '#2A1E1A' },
    football: { base: '#F7F5ED', panels: '#142D35' },
    unlocked: true,
    productId: null,
  },
  {
    id: 'coral-flash',
    name: 'Coral Flash',
    clothing: { shirt: '#FF805D', shirtTrim: '#F7F5ED', shorts: '#142D35', socks: '#FF805D' },
    boots: { main: '#F7F5ED', sole: '#142D35' },
    body: { skin: '#8D5A3C', hair: '#16100E' },
    football: { base: '#F7F5ED', panels: '#FF805D' },
    unlocked: true,
    productId: null,
  },
  {
    id: 'lime-night',
    name: 'Lime Night',
    clothing: { shirt: '#EAF44A', shirtTrim: '#142D35', shorts: '#142D35', socks: '#EAF44A' },
    boots: { main: '#12BFA6', sole: '#F7F5ED' },
    body: { skin: '#F2CDAA', hair: '#C9822B' },
    football: { base: '#EAF44A', panels: '#142D35' },
    unlocked: true,
    productId: null,
  },
];

export const DEFAULT_SKIN_ID = SKINS[0].id;

export function getSkin(id: string): Skin {
  const s = SKINS.find((k) => k.id === id);
  return s && s.unlocked ? s : SKINS[0];
}

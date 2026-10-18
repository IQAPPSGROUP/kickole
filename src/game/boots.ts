export interface Boot {
  id: string;
  name: string;
  /** Soft-currency price. The starter pair is free and already owned. */
  price: number;
  /** Milliseconds added to the perfect window. 0 leaves today's window unchanged. */
  perfectExtra: number;
  /** Milliseconds added to the good window. */
  goodExtra: number;
  /** Milliseconds added to the poor window, kept smaller so the grades stay in order. */
  poorExtra: number;
  main: string;
  sole: string;
  /** Shop copy. Better pairs give more time on the kick. */
  note: string;
}

export const STARTER_BOOT_ID = 'street';

/**
 * Leeway is a few extra milliseconds, not a new timing table.
 * Street Pair matches the base config. Each later pair widens perfect and good a bit more.
 */
export const BOOTS: readonly Boot[] = [
  {
    id: 'street',
    name: 'Street Pair',
    price: 0,
    perfectExtra: 0,
    goodExtra: 0,
    poorExtra: 0,
    main: '#EAF44A',
    sole: '#142D35',
    note: 'The pair you start with.',
  },
  {
    id: 'samba',
    name: 'Samba Soft',
    price: 350,
    perfectExtra: 8,
    goodExtra: 12,
    poorExtra: 8,
    main: '#12BFA6',
    sole: '#142D35',
    note: 'A handful of strong runs. More time on the kick.',
  },
  {
    id: 'carnival',
    name: 'Carnival Flex',
    price: 800,
    perfectExtra: 14,
    goodExtra: 22,
    poorExtra: 12,
    main: '#FF805D',
    sole: '#F7F5ED',
    note: 'Several good sessions. More time on the kick.',
  },
  {
    id: 'ole',
    name: 'Olé Gold',
    price: 1600,
    perfectExtra: 22,
    goodExtra: 32,
    poorExtra: 16,
    main: '#F5C94D',
    sole: '#142D35',
    note: 'A long chase. The most time on the kick.',
  },
];

export function isBootId(id: string): boolean {
  return BOOTS.some((boot) => boot.id === id);
}

export function getBoot(id: string): Boot {
  return BOOTS.find((boot) => boot.id === id) ?? BOOTS[0];
}

/** One coin per scored point. A miss of a run awards nothing. */
export function coinsForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score);
}

export interface Locker {
  coins: number;
  ownedBoots: string[];
  equippedBoot: string;
}

export function normalizeLocker(raw: Partial<Locker> | null | undefined): Locker {
  const owned = Array.isArray(raw?.ownedBoots)
    ? raw.ownedBoots.filter((id): id is string => typeof id === 'string' && isBootId(id))
    : [];
  if (!owned.includes(STARTER_BOOT_ID)) owned.unshift(STARTER_BOOT_ID);
  const equipped = typeof raw?.equippedBoot === 'string' && owned.includes(raw.equippedBoot)
    ? raw.equippedBoot
    : STARTER_BOOT_ID;
  const coins = typeof raw?.coins === 'number' && Number.isFinite(raw.coins) && raw.coins > 0 ? Math.floor(raw.coins) : 0;
  return { coins, ownedBoots: owned, equippedBoot: equipped };
}

export type ShopFailure = 'unknown' | 'broke';

export type ShopResult =
  | { ok: true; locker: Locker }
  | { ok: false; locker: Locker; reason: ShopFailure };

/** Buy when you can pay, or re-equip an owned pair for free. A short balance changes nothing. */
export function buyOrEquip(locker: Locker, bootId: string): ShopResult {
  const boot = BOOTS.find((item) => item.id === bootId);
  if (!boot) return { ok: false, locker, reason: 'unknown' };
  if (locker.ownedBoots.includes(boot.id)) {
    return { ok: true, locker: { ...locker, equippedBoot: boot.id } };
  }
  if (locker.coins < boot.price) return { ok: false, locker, reason: 'broke' };
  return {
    ok: true,
    locker: {
      coins: locker.coins - boot.price,
      ownedBoots: [...locker.ownedBoots, boot.id],
      equippedBoot: boot.id,
    },
  };
}

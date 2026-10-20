import type { StoreProduct } from '../billing/types';

/**
 * Cosmetic dances. They never change timing windows or kick scoring.
 * `productId` is reserved so a later collection can sell a dance. Nothing in
 * this list is a store product. Prices, when a product exists, come from the
 * store's priceString — this module never invents one.
 */
export const DANCE_IDS = ['sway', 'pendulum', 'shuffle', 'heelrock'] as const;
export type DanceId = (typeof DANCE_IDS)[number];

export const STARTER_DANCE_ID: DanceId = 'sway';

/** Saves from before the rename. Boot skin id "samba" is unrelated and stays. */
const LEGACY_DANCE_IDS: Record<string, DanceId> = {
  samba: 'sway',
  robot: 'pendulum',
  griddy: 'shuffle',
  spin: 'heelrock',
};

export interface DanceDesign {
  id: DanceId;
  name: string;
  /** Lifetime milestone rank required. 0 is free from the first run. */
  milestone: 0 | 10 | 25 | 50 | 100;
  /** Future store product id. Null means the dance is not for sale. */
  productId: string | null;
  note: string;
}

export const DANCES: readonly DanceDesign[] = [
  {
    id: 'sway',
    name: 'Soft Sway',
    milestone: 0,
    productId: null,
    note: 'Starter dance. A low weight shift on the steel-pan beat.',
  },
  {
    id: 'pendulum',
    name: 'Pendulum',
    milestone: 10,
    productId: null,
    note: 'Unlocks when you cross a 10 combo, juggle or perfect milestone.',
  },
  {
    id: 'shuffle',
    name: 'Shuffle Step',
    milestone: 25,
    productId: null,
    note: 'Unlocks at a 25 milestone.',
  },
  {
    id: 'heelrock',
    name: 'Heel Rock',
    milestone: 50,
    productId: null,
    note: 'Unlocks at a 50 milestone.',
  },
];

export interface DanceLocker {
  danceRank: number;
  ownedDances: DanceId[];
  equippedDance: DanceId;
}

export function isDanceId(id: string): id is DanceId {
  return (DANCE_IDS as readonly string[]).includes(id);
}

/** Map a stored id, including retired names, onto the current set. */
export function canonicalDanceId(id: string): DanceId | null {
  if (isDanceId(id)) return id;
  return LEGACY_DANCE_IDS[id] ?? null;
}

export function getDance(id: string): DanceDesign | null {
  return DANCES.find((dance) => dance.id === id) ?? null;
}

export function danceUnlocked(rank: number, dance: DanceDesign): boolean {
  return rank >= dance.milestone;
}

export function dancesOwnedAt(rank: number): DanceId[] {
  return DANCES.filter((dance) => danceUnlocked(rank, dance)).map((dance) => dance.id);
}

/** Highest 10/25/50/100 mark in a cheer id. Tier unlocks sit on the same ladder. */
export function rankFromCheer(id: string): number {
  const mark = /:(10|25|50|100)$/.exec(id);
  if (mark) return Number(mark[1]);
  switch (id) {
    case 'tier:club': return 10;
    case 'tier:street': return 25;
    case 'tier:freestyle': return 50;
    case 'tier:legend': return 100;
    default: return 0;
  }
}

export function rankFromCheers(ids: readonly string[]): number {
  return ids.reduce((best, id) => Math.max(best, rankFromCheer(id)), 0);
}

/**
 * Which dance plays for a celebration.
 * A milestone that unlocks a dance uses that dance. Other moments use the equipped one.
 */
export function celebrationDance(reason: string, equipped: DanceId, owned: readonly DanceId[]): DanceId {
  const rank = rankFromCheer(reason);
  if (rank > 0) {
    const fresh = DANCES.find((dance) => dance.milestone === rank);
    if (fresh && owned.includes(fresh.id)) return fresh.id;
    const tier = [...DANCES].reverse().find((dance) => dance.milestone > 0 && dance.milestone <= rank && owned.includes(dance.id));
    if (tier && reason.startsWith('tier:')) return tier.id;
  }
  return owned.includes(equipped) ? equipped : STARTER_DANCE_ID;
}

/**
 * Localised store price, or null when the dance is not sold or the store has
 * not returned a priceString. Callers must not substitute a hardcoded price.
 */
export function dancePriceString(
  dance: DanceDesign,
  products: readonly Pick<StoreProduct, 'productId' | 'priceString'>[],
): string | null {
  if (!dance.productId) return null;
  const price = products.find((product) => product.productId === dance.productId)?.priceString;
  if (typeof price !== 'string' || price.trim().length === 0) return null;
  return price;
}

export function normalizeDances(raw: {
  danceRank?: unknown;
  ownedDances?: unknown;
  equippedDance?: unknown;
} | null | undefined): DanceLocker {
  const rank = typeof raw?.danceRank === 'number' && Number.isFinite(raw.danceRank) && raw.danceRank > 0
    ? Math.min(100, Math.floor(raw.danceRank))
    : 0;
  const owned = new Set<DanceId>(dancesOwnedAt(rank));
  if (Array.isArray(raw?.ownedDances)) {
    for (const id of raw.ownedDances) {
      if (typeof id !== 'string') continue;
      const canonical = canonicalDanceId(id);
      if (!canonical) continue;
      const dance = getDance(canonical);
      if (dance && danceUnlocked(rank, dance)) owned.add(canonical);
    }
  }
  owned.add(STARTER_DANCE_ID);
  const ownedDances = DANCES.map((dance) => dance.id).filter((id) => owned.has(id));
  const equippedRaw = typeof raw?.equippedDance === 'string' ? canonicalDanceId(raw.equippedDance) : null;
  const equipped = equippedRaw && owned.has(equippedRaw) ? equippedRaw : STARTER_DANCE_ID;
  return { danceRank: rank, ownedDances, equippedDance: equipped };
}

export function withDanceRank(locker: DanceLocker, rank: number): DanceLocker {
  const next = normalizeDances({
    danceRank: Math.max(locker.danceRank, rank),
    ownedDances: locker.ownedDances,
    equippedDance: locker.equippedDance,
  });
  return next;
}

export function equipDance(locker: DanceLocker, id: string): { ok: boolean; locker: DanceLocker } {
  if (!isDanceId(id) || !locker.ownedDances.includes(id)) return { ok: false, locker };
  return { ok: true, locker: { ...locker, equippedDance: id } };
}

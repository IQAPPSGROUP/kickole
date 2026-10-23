import type { ClothingColors, PlayerBody } from './appearance';

/**
 * Themed cosmetics kept for the character renderer. They never change kick
 * timing or scoring, and this build does not sell them.
 */

export const OUTFIT_IDS = [
  'alien',
  'spaceman',
  'street-hero',
  'night-glider',
  'night-wrap',
  'deck-hand',
  'secret-agent',
  'grey-ghoul',
  'keep-guard',
  'kitchen-whites',
  'spike-hood',
  'stage-jacket',
  'ring-mask',
  'match-official',
  'seventies',
  'north-pole',
  'snow-friend',
  'gold-legend',
] as const;

export type OutfitId = (typeof OUTFIT_IDS)[number];

export const COWBOY_BOOT_ID = 'boot-cowboy';

/**
 * Best score in a single run. Not a lifetime total and not a purchase.
 * Chef 1000, Referee 2500, Knight 4000, Snowman 5500, Dino Onesie 7000, Gold Legend 10000.
 */
export const EARNED_BEST_SCORE = {
  'kitchen-whites': 1000,
  'match-official': 2500,
  'keep-guard': 4000,
  'snow-friend': 5500,
  'spike-hood': 7000,
  'gold-legend': 10000,
} as const;

export const GOLD_LEGEND_SCORE = EARNED_BEST_SCORE['gold-legend'];

export type PlayStat = 'bestScore';

export interface PlayMilestone {
  kind: PlayStat;
  target: number;
  /** Progress noun. No clock and no price. */
  label: string;
}

export interface MilestoneStats {
  /** Highest score from one run. Runs are not added together. */
  bestScore: number;
}

export type OutfitPattern = 'weave' | 'stripes' | 'chain' | 'torn' | 'gold' | 'leather' | 'snow' | 'night';

export interface OutfitDesign {
  id: OutfitId;
  name: string;
  /** Set for looks earned in play. Other looks stay on the renderer and are not equipped from a save. */
  milestone: PlayMilestone | null;
  clothing: ClothingColors;
  pattern: OutfitPattern;
  /** Pale costume tint on the skin map. Null keeps the footballer's own skin. */
  skinTint: string | null;
  note: string;
}

const cloth = (shirt: string, shirtTrim: string, shorts: string, socks: string): ClothingColors => ({
  shirt, shirtTrim, shorts, socks,
});

const earned = (target: number): PlayMilestone => ({ kind: 'bestScore', target, label: 'best score' });

export const OUTFITS: readonly OutfitDesign[] = [
  {
    id: 'alien',
    name: 'Alien',
    milestone: null,
    clothing: cloth('#6FBF8A', '#1F6B45', '#2F8F5B', '#D5E8D4'),
    pattern: 'weave',
    skinTint: null,
    note: 'Green skin-tone suit and an antenna headband. The face stays the footballer.',
  },
  {
    id: 'spaceman',
    name: 'Spaceman',
    milestone: null,
    clothing: cloth('#F4F7F8', '#C5D0D6', '#E7EEF2', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'White suit, visor flipped up, and a backpack.',
  },
  {
    id: 'street-hero',
    name: 'Superhero',
    milestone: null,
    clothing: cloth('#1F8A8A', '#F26B5B', '#163E3E', '#F4C7A8'),
    pattern: 'weave',
    skinTint: null,
    note: 'Teal kit and plain wristbands. No cape, cowl or chest emblem.',
  },
  {
    id: 'night-glider',
    name: 'Shadow Hero',
    milestone: null,
    clothing: cloth('#2A2E33', '#8B939C', '#1A1D21', '#3A3F45'),
    pattern: 'night',
    skinTint: null,
    note: 'Charcoal suit, teal visor, belt and a small yellow triangle. No cape and no bat symbol.',
  },
  {
    id: 'night-wrap',
    name: 'Ninja',
    milestone: null,
    clothing: cloth('#1C1C1C', '#C0392B', '#111111', '#2A2A2A'),
    pattern: 'night',
    skinTint: null,
    note: 'Black wrap, headband, and forearm tape.',
  },
  {
    id: 'deck-hand',
    name: 'Pirate',
    milestone: null,
    clothing: cloth('#F4F1EA', '#6B1D1D', '#1E3A5F', '#F4F1EA'),
    pattern: 'stripes',
    skinTint: null,
    note: 'Striped shirt, waistcoat, bandana, and an eyepatch.',
  },
  {
    id: 'secret-agent',
    name: 'Secret Agent',
    milestone: null,
    clothing: cloth('#1E2430', '#F4F1EA', '#141820', '#2A3140'),
    pattern: 'night',
    skinTint: null,
    note: 'Dark suit, glasses and a narrow tie. No mask and no sack.',
  },
  {
    id: 'grey-ghoul',
    name: 'Zombie',
    milestone: null,
    clothing: cloth('#8E9089', '#5C5E58', '#6A6C66', '#B7B8B2'),
    pattern: 'torn',
    skinTint: '#C5C6C0',
    note: 'Pale grey costume and cloth bandages. A cartoon costume.',
  },
  {
    id: 'keep-guard',
    name: 'Knight',
    milestone: earned(EARNED_BEST_SCORE['keep-guard']),
    clothing: cloth('#C0C4C8', '#7A1F2B', '#4A4E55', '#D9DDE2'),
    pattern: 'chain',
    skinTint: null,
    note: 'Matte plate: helmet, breastplate, pauldrons, gauntlets and a maroon tabard. Earned in play.',
  },
  {
    id: 'kitchen-whites',
    name: 'Chef',
    milestone: earned(EARNED_BEST_SCORE['kitchen-whites']),
    clothing: cloth('#F7F5ED', '#E7E2D6', '#F4F1EA', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'Whites, a full apron, and a tall hat. Earned in play.',
  },
  {
    id: 'spike-hood',
    name: 'Dino Onesie',
    milestone: earned(EARNED_BEST_SCORE['spike-hood']),
    clothing: cloth('#3E7D4F', '#E7A317', '#2C5A38', '#6FA37A'),
    pattern: 'weave',
    skinTint: null,
    note: 'Dino onesie hood with three spikes. The face stays open. Earned in play.',
  },
  {
    id: 'stage-jacket',
    name: 'Rockstar',
    milestone: null,
    clothing: cloth('#2B241C', '#C4A574', '#1A1612', '#3A3128'),
    pattern: 'leather',
    skinTint: null,
    note: 'Leather jacket, small shades, and a quiff.',
  },
  {
    id: 'ring-mask',
    name: 'Lucha',
    milestone: null,
    clothing: cloth('#E23B4A', '#F2C14E', '#1F6B8A', '#F2C14E'),
    pattern: 'weave',
    skinTint: null,
    note: 'Teal brow band, two dots, and a short cape. An original mask.',
  },
  {
    id: 'match-official',
    name: 'Referee',
    milestone: earned(EARNED_BEST_SCORE['match-official']),
    clothing: cloth('#1A1A1A', '#F7F5ED', '#141414', '#1A1A1A'),
    pattern: 'night',
    skinTint: null,
    note: 'All black, a whistle, and two plain cards. No league or club mark. Earned in play.',
  },
  {
    id: 'seventies',
    name: 'Retro 70s',
    milestone: null,
    clothing: cloth('#E07A3D', '#F4F1EA', '#F2C14E', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'Sweatband and a costume moustache. No club mark. Shorts stay the footballer cut.',
  },
  {
    id: 'north-pole',
    name: 'Santa',
    milestone: null,
    clothing: cloth('#B4232A', '#F4F1EA', '#8E1C22', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'Red suit, hat, and a short beard that leaves the eyes clear.',
  },
  {
    id: 'snow-friend',
    name: 'Snowman',
    milestone: earned(EARNED_BEST_SCORE['snow-friend']),
    clothing: cloth('#F7FBFF', '#E24B4B', '#F4F7FA', '#F7FBFF'),
    pattern: 'snow',
    skinTint: null,
    note: 'White kit, scarf, buttons, and a carrot nose. Earned in play.',
  },
  {
    id: 'gold-legend',
    name: 'Gold Legend',
    milestone: earned(GOLD_LEGEND_SCORE),
    clothing: cloth('#E3B341', '#8A6A1F', '#C4922A', '#F0D78C'),
    pattern: 'gold',
    skinTint: null,
    note: `Shiny gold kit. Unlocks at a best score of ${GOLD_LEGEND_SCORE} in one run.`,
  },
];

export const EARNED_OUTFIT_IDS = [
  'kitchen-whites',
  'match-official',
  'keep-guard',
  'snow-friend',
  'spike-hood',
  'gold-legend',
] as const satisfies readonly OutfitId[];

export function isOutfitId(id: string): id is OutfitId {
  return (OUTFIT_IDS as readonly string[]).includes(id);
}

export function getOutfit(id: string | null | undefined): OutfitDesign | null {
  if (!id || !isOutfitId(id)) return null;
  return OUTFITS.find((outfit) => outfit.id === id) ?? null;
}

export function milestoneMet(stats: MilestoneStats, milestone: PlayMilestone): boolean {
  const current = milestoneCurrent(stats, milestone);
  return Number.isFinite(current) && current >= milestone.target;
}

export function milestoneCurrent(stats: MilestoneStats, milestone: PlayMilestone): number {
  switch (milestone.kind) {
    case 'bestScore':
      return stats.bestScore;
    default: {
      const neverKind: never = milestone.kind;
      return neverKind;
    }
  }
}

export function earnedOutfit(id: string): boolean {
  return getOutfit(id)?.milestone != null;
}

export function goldLegendUnlocked(bestScore: number): boolean {
  return Number.isFinite(bestScore) && bestScore >= GOLD_LEGEND_SCORE;
}

/** Both bodies wear the same full kit. Accessories are fitted separately. */
export function outfitCoversBody(outfit: OutfitDesign): boolean {
  const { shirt, shorts, socks } = outfit.clothing;
  return Boolean(shirt && shorts && socks);
}

export function outfitsForBody(_body: PlayerBody): readonly OutfitDesign[] {
  return OUTFITS;
}

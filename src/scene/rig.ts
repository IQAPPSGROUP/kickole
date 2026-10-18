import type { GameEngine } from '../engine/engine';
import type { Side } from '../engine/config';
import type { Skin } from '../game/skins';

/**
 * Contract for a rigged GLB footballer. See docs/CHARACTER_GLB.md for the full specification.
 * Everything here is renderer-agnostic so it can be unit tested.
 */

/** Use the bundled GLB by default; VITE_USE_GLB_CHARACTER=false selects the primitive fallback. */
export const USE_GLB_CHARACTER = import.meta.env.VITE_USE_GLB_CHARACTER !== 'false';

/**
 * Default gameplay model (Freddie Quaternius v2). Override with VITE_CHARACTER_MODEL
 * (path under public/, e.g. `models/kicky-player-rigged.glb`) to use the legacy procedural GLB.
 */
export const DEFAULT_CHARACTER_MODEL = 'models/kickole_player_v2.glb';

/** Where the model is expected. If the file is missing or invalid the primitive character is used. */
export const CHARACTER_MODEL_URL = `${import.meta.env.BASE_URL}${(
  (import.meta.env.VITE_CHARACTER_MODEL as string | undefined) ?? DEFAULT_CHARACTER_MODEL
).replace(/^\//, '')}`;

/** Named animation states. Each maps to an animation clip with exactly this name in the GLB. */
export const ANIMATION_STATES = ['Idle', 'KickLeft', 'KickRight', 'Miss', 'Celebrate'] as const;
export type AnimationState = (typeof ANIMATION_STATES)[number];

/** Clips that must loop; all others play once and hold the last frame until the next state. */
export const LOOPING_STATES: ReadonlySet<AnimationState> = new Set(['Idle']);

/** Seconds after the tap at which the foot meets the ball (matches the procedural kickEnvelope peak). */
export const KICK_CONTACT_TIME = 0.04;

/** Seconds into a Kick clip at which the foot meets the ball in the authored animation. */
export const KICK_CLIP_CONTACT_TIME = 0.3;

/**
 * Where a Kick clip starts so its contact frame lands KICK_CONTACT_TIME after the engine registered the tap.
 * The wind-up is skipped because the player cannot be seen to wind up before they decide to tap.
 */
export const KICK_CLIP_START = KICK_CLIP_CONTACT_TIME - KICK_CONTACT_TIME;

/** Preferred Mixamo-style bone names (docs/CHARACTER_GLB.md). */
export const BONE_NAMES = {
  root: 'Hips',
  spine: 'Spine',
  head: 'Head',
  armLeft: 'UpperArm_L',
  armRight: 'UpperArm_R',
  thighLeft: 'UpperLeg_L',
  thighRight: 'UpperLeg_R',
  shinLeft: 'LowerLeg_L',
  shinRight: 'LowerLeg_R',
  footLeft: 'Foot_L',
  footRight: 'Foot_R',
} as const;
export type BoneKey = keyof typeof BONE_NAMES;

/**
 * Accepted names per contract bone, first match wins.
 * Freddie/Quaternius UE bones use anatomical `_l`/`_r` where anatomical left is world +X while facing +Z;
 * the game’s `_L` is world −X, so UE sides are swapped relative to the Mixamo-style contract names.
 */
export const BONE_NAME_ALIASES: Record<BoneKey, readonly string[]> = {
  root: ['Hips', 'pelvis'],
  spine: ['Spine', 'spine_01'],
  head: ['Head'],
  armLeft: ['UpperArm_L', 'upperarm_r'],
  armRight: ['UpperArm_R', 'upperarm_l'],
  thighLeft: ['UpperLeg_L', 'thigh_r'],
  thighRight: ['UpperLeg_R', 'thigh_l'],
  shinLeft: ['LowerLeg_L', 'calf_r'],
  shinRight: ['LowerLeg_R', 'calf_l'],
  footLeft: ['Foot_L', 'foot_r'],
  footRight: ['Foot_R', 'foot_l'],
};

/** Resolve the actual bone node name present in a model for a contract bone key. */
export function resolveBoneName(key: BoneKey, present: ReadonlySet<string>): string | undefined {
  return BONE_NAME_ALIASES[key].find((n) => present.has(n));
}

/** Material names the model must use; skins recolour them. */
export const MATERIAL_NAMES = {
  shirt: 'Shirt',
  shirtTrim: 'Shirt_Trim',
  shorts: 'Shorts',
  socks: 'Socks',
  boots: 'Boots',
  bootsSole: 'Boots_Sole',
  skin: 'Skin',
  hair: 'Hair',
} as const;

/** Colour for each contract material, taken from the skin config. */
export function skinMaterialColors(skin: Skin): Record<string, string> {
  return {
    [MATERIAL_NAMES.shirt]: skin.clothing.shirt,
    [MATERIAL_NAMES.shirtTrim]: skin.clothing.shirtTrim,
    [MATERIAL_NAMES.shorts]: skin.clothing.shorts,
    [MATERIAL_NAMES.socks]: skin.clothing.socks,
    [MATERIAL_NAMES.boots]: skin.boots.main,
    [MATERIAL_NAMES.bootsSole]: skin.boots.sole,
    [MATERIAL_NAMES.skin]: skin.body.skin,
    [MATERIAL_NAMES.hair]: skin.body.hair,
  };
}

export interface ModelReport {
  missingBones: string[];
  missingClips: string[];
  missingMaterials: string[];
}

/** Compare what a loaded model provides with the contract (bone aliases count as present). */
export function validateModel(bones: Iterable<string>, clips: Iterable<string>, materials: Iterable<string>): ModelReport {
  const b = new Set(bones);
  const c = new Set(clips);
  const m = new Set(materials);
  return {
    missingBones: (Object.keys(BONE_NAMES) as BoneKey[])
      .filter((k) => !resolveBoneName(k, b))
      .map((k) => BONE_NAMES[k]),
    missingClips: ANIMATION_STATES.filter((n) => !c.has(n)),
    missingMaterials: Object.values(MATERIAL_NAMES).filter((n) => !m.has(n)),
  };
}

export interface StateResult {
  state: AnimationState;
  /** Changes every time a one-shot foot action starts so a repeated kick restarts its clip. */
  token: number;
  /** For Kick states: the exact clip time (s) to display, derived from the engine so the foot meets the ball when physics does. */
  clipTime?: number;
}

const KICK_POST_CONTACT = 0.35;
/** Celebrate starts after the kick window and lasts the full clip (36 frames at 30 fps), ending on the Idle pose. */
const CELEBRATE_WINDOW = KICK_POST_CONTACT + 1.2;

/**
 * Clip time for a kick on `side`. The clip starts KICK_CLIP_START after 0 at the tap, reaches its 0.30 s contact frame
 * when the engine responds (tap + contactDelay), is held on that frame while the ball is trapped (foot stall) and plays
 * on from it once the ball is released. Purely a function of engine state, so it is deterministic and testable.
 */
export function kickClipTime(engine: GameEngine, side: Side): number {
  const t = engine.time;
  const sinceTap = t - engine.lastKick[side];
  const c = engine.contact;
  if (c && c.side === side) return Math.min(KICK_CLIP_START + Math.max(0, sinceTap), KICK_CLIP_CONTACT_TIME);
  if (engine.lastContact[side] >= engine.lastKick[side]) return KICK_CLIP_CONTACT_TIME + Math.max(0, t - engine.lastContact[side]);
  return KICK_CLIP_START + Math.max(0, sinceTap);
}

/** Choose the animation state from engine state. Deterministic and independent of rendering. */
export function selectAnimationState(engine: GameEngine): StateResult {
  const t = engine.time;
  const phase = engine.phase;
  const lastL = engine.lastKick.left;
  const lastR = engine.lastKick.right;
  const side: Side = lastL >= lastR ? 'left' : 'right';
  const lastKick = Math.max(lastL, lastR);
  const token = Math.round(lastKick * 1000);

  if (phase === 'dropped' || phase === 'over') return { state: 'Miss', token: 0 };
  if (phase === 'menu') return { state: 'Idle', token: 0 };
  if (phase === 'ready') return { state: 'Idle', token: 0 };

  const kickState = side === 'left' ? 'KickLeft' : 'KickRight';
  const c = engine.contact;
  if (c) return {
    state: c.side === 'left' ? 'KickLeft' : 'KickRight',
    token: Math.round(engine.lastKick[c.side] * 1000),
    clipTime: kickClipTime(engine, c.side),
  };
  const sinceTap = t - lastKick;
  const lastContact = engine.lastContact[side];
  const sinceEnd = lastContact >= lastKick ? t - lastContact : sinceTap;
  if (sinceTap >= 0 && sinceEnd < KICK_POST_CONTACT) return { state: kickState, token, clipTime: kickClipTime(engine, side) };
  const sincePerfect = t - engine.lastPerfectTime;
  if (sincePerfect >= 0 && sincePerfect < CELEBRATE_WINDOW) return { state: 'Celebrate', token: Math.round(engine.lastPerfectTime * 1000) };
  return { state: 'Idle', token: 0 };
}

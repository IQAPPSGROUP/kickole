import type { PlayerBody } from './appearance';
import { OUTFIT_IDS, type OutfitId } from './outfits';

/**
 * Whole-outfit meshes in public/models/outfits, skinned to kickole_player_v4.
 * These replace the bone-parented box accessories.
 */
export const MESH_OUTFIT_IDS = OUTFIT_IDS;

export type MeshOutfitId = OutfitId;

export function isMeshOutfit(id: string | null | undefined): id is MeshOutfitId {
  return id != null && (MESH_OUTFIT_IDS as readonly string[]).includes(id);
}

export function outfitModelUrl(id: MeshOutfitId, body: PlayerBody): string {
  return `${import.meta.env.BASE_URL}models/outfits/${id}-${body}.glb`;
}

/** Which base-body surfaces the outfit shell replaces. */
export interface OutfitCover {
  /** Hoods, helmets, and hats hide the hair. A brow band leaves it. */
  hideHair: boolean;
  /** Full suits hide arm and leg skin. The head skin stays, so the face shows. */
  hideBodySkin: boolean;
}

const covered = (hideHair: boolean): OutfitCover => ({ hideHair, hideBodySkin: true });

export const OUTFIT_COVER: Record<MeshOutfitId, OutfitCover> = {
  alien: covered(false),
  spaceman: covered(false),
  'street-hero': covered(false),
  'night-glider': covered(true),
  'night-wrap': covered(true),
  'deck-hand': covered(true),
  'secret-agent': covered(false),
  'grey-ghoul': covered(false),
  'keep-guard': covered(true),
  'kitchen-whites': covered(true),
  'spike-hood': covered(true),
  'stage-jacket': covered(true),
  'ring-mask': covered(true),
  'match-official': covered(false),
  seventies: covered(false),
  'north-pole': covered(true),
  'snow-friend': covered(false),
  'gold-legend': covered(false),
};

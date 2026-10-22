import type { PlayerBody } from './appearance';

/**
 * Whole-outfit meshes in public/models/outfits, skinned to kickole_player_v4.
 * These replace the bone-parented box accessories for the same ids.
 */
export const MESH_OUTFIT_IDS = ['spike-hood', 'keep-guard', 'night-glider'] as const;

export type MeshOutfitId = (typeof MESH_OUTFIT_IDS)[number];

export function isMeshOutfit(id: string | null | undefined): id is MeshOutfitId {
  return id != null && (MESH_OUTFIT_IDS as readonly string[]).includes(id);
}

export function outfitModelUrl(id: MeshOutfitId, body: PlayerBody): string {
  return `${import.meta.env.BASE_URL}models/outfits/${id}-${body}.glb`;
}

/** Which base-body surfaces the outfit shell replaces. */
export interface OutfitCover {
  /** Hoods and helmets hide the hair. A brow band leaves it. */
  hideHair: boolean;
  /** Full suits hide arm and leg skin. The head skin stays, so the face shows. */
  hideBodySkin: boolean;
}

export const OUTFIT_COVER: Record<MeshOutfitId, OutfitCover> = {
  'spike-hood': { hideHair: true, hideBodySkin: true },
  'keep-guard': { hideHair: true, hideBodySkin: true },
  'night-glider': { hideHair: false, hideBodySkin: true },
};

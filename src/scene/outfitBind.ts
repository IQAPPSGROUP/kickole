import { Matrix4, Skeleton, type Bone, type BufferGeometry, type Material, type Object3D, type SkinnedMesh } from 'three';
import type { OutfitCover } from '../game/outfitMesh';

const KIT_MATERIALS = new Set(['Shirt', 'Shirt_Trim', 'Shorts', 'Socks', 'Boots', 'Boots_Sole']);

interface DrawGroup {
  start: number;
  count: number;
  materialIndex: number;
}

function drawGroups(geometry: BufferGeometry): DrawGroup[] {
  if (geometry.groups.length > 0) {
    return geometry.groups.map((group) => ({
      start: group.start,
      count: group.count,
      materialIndex: group.materialIndex ?? 0,
    }));
  }
  const count = geometry.index ? geometry.index.count : (geometry.getAttribute('position')?.count ?? 0);
  return [{ start: 0, count, materialIndex: 0 }];
}

/** Head skin sits above the shoulders. Arm and leg skin stay below that line. */
function isHeadSkin(geometry: BufferGeometry, group: DrawGroup): boolean {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position || group.count <= 0) return false;
  let maxY = Number.NEGATIVE_INFINITY;
  const step = Math.max(1, Math.floor(group.count / 64));
  const end = group.start + group.count;
  for (let i = group.start; i < end; i += step) {
    const vertex = index ? index.getX(i) : i;
    const y = position.getY(vertex);
    if (y > maxY) maxY = y;
  }
  return maxY > 0.55;
}

/**
 * Parent an outfit GLB to the live character and reuse that skeleton.
 * The outfit file carries the same joint order and inverse bind matrices
 * as kickole_player_v4, so the shell follows the clips.
 */
export function bindOutfit(host: Object3D, outfitRoot: Object3D): SkinnedMesh[] {
  const byName = new Map<string, Bone>();
  host.traverse((obj) => {
    const bone = obj as Bone;
    if (bone.isBone) byName.set(bone.name, bone);
  });
  let bodyBind: Matrix4 | null = null;
  host.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (mesh.isSkinnedMesh && bodyBind == null) bodyBind = mesh.bindMatrix.clone();
  });
  const found: SkinnedMesh[] = [];
  outfitRoot.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (mesh.isSkinnedMesh) found.push(mesh);
  });
  const added: SkinnedMesh[] = [];
  for (const mesh of found) {
    const bones: Bone[] = [];
    for (const bone of mesh.skeleton.bones) {
      const live = byName.get(bone.name);
      if (!live) throw new Error(`Outfit is missing bone ${bone.name}`);
      bones.push(live);
    }
    const inverses = mesh.skeleton.boneInverses.map((inverse) => inverse.clone());
    mesh.removeFromParent();
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.outfit = true;
    mesh.bind(new Skeleton(bones, inverses), bodyBind ?? new Matrix4());
    host.add(mesh);
    added.push(mesh);
  }
  return added;
}

/** Hide the football kit under a whole-outfit shell. The face skin stays. */
export function coverBody(host: Object3D, cover: OutfitCover): () => void {
  const touched: Material[] = [];
  host.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isMesh || mesh.userData.outfit) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const group of drawGroups(mesh.geometry)) {
      const material = materials[group.materialIndex];
      if (!material || !material.visible) continue;
      const kit = KIT_MATERIALS.has(material.name);
      const hair = material.name === 'Hair' && cover.hideHair;
      const bodySkin = material.name === 'Skin' && cover.hideBodySkin && !isHeadSkin(mesh.geometry, group);
      if (!kit && !hair && !bodySkin) continue;
      material.visible = false;
      touched.push(material);
    }
  });
  return () => {
    for (const material of touched) material.visible = true;
  };
}

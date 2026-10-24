import { BoxGeometry, ConeGeometry, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Material, type Object3D, type Bone } from 'three';
import { FIT_BONE_NAME, type MeshSpec } from '../game/outfitFit';

function geometry(spec: MeshSpec): BufferGeometry {
  if (spec.shape === 'sphere') return new SphereGeometry(spec.size[0], 14, 12);
  if (spec.shape === 'cone') return new ConeGeometry(spec.size[0], spec.size[1], 12);
  return new BoxGeometry(spec.size[0], spec.size[1], spec.size[2]);
}

/** Parent costume pieces to the shared contract bones. Missing bones are skipped. */
export function mountOutfitSpecs(root: Object3D, specs: readonly MeshSpec[]): () => void {
  const bones = new Map<string, Bone>();
  root.traverse((obj) => {
    const bone = obj as Bone;
    if (bone.isBone) bones.set(bone.name, bone);
  });
  const meshes: Mesh[] = [];
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  for (const spec of specs) {
    const bone = bones.get(FIT_BONE_NAME[spec.bone]);
    if (!bone) continue;
    const geo = geometry(spec);
    const mat = new MeshStandardMaterial({
      name: spec.name,
      color: spec.color,
      roughness: spec.roughness ?? 0.55,
      metalness: spec.metalness ?? 0.04,
    });
    const mesh = new Mesh(geo, mat);
    mesh.name = spec.name;
    mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
    if (spec.rotation) mesh.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    bone.add(mesh);
    meshes.push(mesh);
    geos.push(geo);
    mats.push(mat);
  }
  return () => {
    for (const mesh of meshes) mesh.parent?.remove(mesh);
    for (const geo of geos) geo.dispose();
    for (const mat of mats) mat.dispose();
  };
}

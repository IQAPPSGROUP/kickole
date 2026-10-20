import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, Mesh, MeshStandardMaterial, type Bone, type Object3D } from 'three';
import type { HairStyle } from '../game/appearance';
import { DRACO_DECODER_PATH } from './decoders';
import { hairSpring } from './secondaryMotion';
import type { HairBody } from './hairFit';

const HAIR_URL = `${import.meta.env.BASE_URL}models/hair/kickole_hair.glb`;

/**
 * Alpha-card hairstyles parented to the head bone.
 * Short keeps the purchased hair mesh. Every other style hides it and
 * shows an opaque scalp cap so the head photograph's painted hair stays covered.
 */
export function HairVariants({
  head,
  style,
  color,
  hairMesh,
  body = 'male',
}: {
  head: Bone | Object3D | undefined;
  style: HairStyle;
  color: string;
  hairMesh?: Object3D[];
  body?: HairBody;
}) {
  const gltf = useGLTF(HAIR_URL, DRACO_DECODER_PATH, true);
  const group = useRef<Group>(null);
  const showScalp = style !== 'short';
  const showCards = style !== 'bald' && (style !== 'short' || body === 'primitive');

  const scalp = useMemo(() => {
    if (!showScalp) return null;
    const source = gltf.scene.getObjectByName(`${body}-scalp`);
    return source ? cloneHair(source, color, false) : null;
  }, [body, color, gltf.scene, showScalp]);

  const cards = useMemo(() => {
    if (!showCards) return null;
    const source = gltf.scene.getObjectByName(`${body}-${style}`);
    return source ? cloneHair(source, color, true) : null;
  }, [body, color, gltf.scene, showCards, style]);

  useEffect(() => () => {
    disposeMaterials(scalp);
    disposeMaterials(cards);
  }, [scalp, cards]);

  useLayoutEffect(() => {
    if (!head || !group.current) return;
    head.add(group.current);
    return () => {
      if (group.current) head.remove(group.current);
    };
  }, [head]);

  useFrame(() => {
    if (hairMesh) for (const mesh of hairMesh) mesh.visible = style === 'short';
    if (group.current) group.current.rotation.set(hairSpring.pitch, hairSpring.yaw, hairSpring.roll);
  });

  if (!head) return null;

  return (
    <group ref={group}>
      {scalp && <primitive object={scalp} />}
      {cards && <primitive object={cards} />}
    </group>
  );
}

function cloneHair(source: Object3D, color: string, tint: boolean): Object3D {
  const clone = source.clone(true);
  clone.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((material) => {
      const copy = (material as MeshStandardMaterial).clone();
      if (tint && copy.name.startsWith('hair')) copy.color.set(color);
      copy.depthWrite = true;
      return copy;
    });
    mesh.material = next.length === 1 ? next[0] : next;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return clone;
}

function disposeMaterials(root: Object3D | null) {
  root?.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) material.dispose();
  });
}

import { Component, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DRACO_DECODER_PATH } from './decoders';
import type { OutfitCover } from '../game/outfitMesh';
import { bindOutfit, coverBody } from './outfitBind';

class OutfitBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('Outfit mesh failed to load.', err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SkinnedOutfit({ url, host, cover }: { url: string; host: Object3D; cover: OutfitCover }) {
  const gltf = useGLTF(url, DRACO_DECODER_PATH);
  useLayoutEffect(() => {
    const root = cloneSkinned(gltf.scene);
    const meshes = bindOutfit(host, root);
    const restore = coverBody(host, cover);
    return () => {
      restore();
      for (const mesh of meshes) mesh.parent?.remove(mesh);
    };
  }, [gltf, host, cover]);
  return null;
}

/** Loads one skinned outfit and hides the kit it replaces. */
export function MountedOutfit({ url, host, cover }: { url: string; host: Object3D; cover: OutfitCover }) {
  return (
    <OutfitBoundary>
      <Suspense fallback={null}>
        <SkinnedOutfit url={url} host={host} cover={cover} />
      </Suspense>
    </OutfitBoundary>
  );
}

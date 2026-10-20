import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BufferGeometry, Mesh, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, type WebGLRenderer } from 'three';
import { KTX2_TRANSCODER_PATH } from './decoders';

const ktxLoaders = new WeakMap<WebGLRenderer, KTX2Loader>();

function ktxLoaderFor(gl: WebGLRenderer): KTX2Loader {
  const existing = ktxLoaders.get(gl);
  if (existing) return existing;
  const loader = new KTX2Loader();
  loader.setTranscoderPath(KTX2_TRANSCODER_PATH);
  loader.detectSupport(gl);
  ktxLoaders.set(gl, loader);
  return loader;
}

export interface StreetMaps {
  color: Texture | null;
  normal: Texture | null;
  rough: Texture | null;
}

const EMPTY: StreetMaps = { color: null, normal: null, rough: null };

/** Local KTX2 maps. A null URL skips that channel so lower tiers do not download it. */
export function useStreetMaps(colorUrl: string | null, normalUrl: string | null, roughUrl: string | null, repeatX: number, repeatY: number): StreetMaps {
  const gl = useThree((state) => state.gl);
  const [maps, setMaps] = useState<StreetMaps>(EMPTY);
  useEffect(() => {
    const loader = ktxLoaderFor(gl);
    let alive = true;
    const loaded: Texture[] = [];
    const grab = (url: string | null) => new Promise<Texture | null>((resolve) => {
      if (!url) { resolve(null); return; }
      loader.load(url, (tex) => {
        if (!alive) { tex.dispose(); return; }
        loaded.push(tex);
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        resolve(tex);
      }, undefined, () => resolve(null));
    });
    void Promise.all([grab(colorUrl), grab(normalUrl), grab(roughUrl)]).then(([color, normal, rough]) => {
      if (!alive) return;
      if (color) color.colorSpace = SRGBColorSpace;
      if (normal) normal.colorSpace = NoColorSpace;
      if (rough) rough.colorSpace = NoColorSpace;
      setMaps({ color, normal, rough });
    });
    return () => {
      alive = false;
      for (const tex of loaded) tex.dispose();
      setMaps(EMPTY);
    };
  }, [gl, colorUrl, normalUrl, roughUrl, repeatX, repeatY]);
  return maps;
}

export interface StreetNode {
  name: string;
  geometry: BufferGeometry;
  /** Node translation. Meshopt recenters the vertices, so this is the part's real center. */
  pivot: [number, number, number];
  /** Node scale that restores the recentered vertices to meters. */
  scale: [number, number, number];
}

/** Meshopt GLB. Geometries stay on the component until the tier canvas remounts. */
export function useStreetNodes(url: string | null): StreetNode[] {
  const [nodes, setNodes] = useState<StreetNode[]>([]);
  useEffect(() => {
    if (!url) { setNodes([]); return; }
    let alive = true;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(url, (gltf) => {
      if (!alive) return;
      const found: StreetNode[] = [];
      gltf.scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const pivotNode = mesh.parent ?? mesh;
        found.push({
          name: mesh.name || pivotNode.name,
          geometry: mesh.geometry,
          pivot: [pivotNode.position.x, pivotNode.position.y, pivotNode.position.z],
          scale: [pivotNode.scale.x, pivotNode.scale.y, pivotNode.scale.z],
        });
      });
      setNodes(found);
    });
    return () => { alive = false; };
  }, [url]);
  return nodes;
}

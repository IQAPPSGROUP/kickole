import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Mesh, MeshStandardMaterial, type Object3D, type WebGLRenderer } from 'three';
import type { Quality } from '../game/storage';
import { KTX2_TRANSCODER_PATH } from './decoders';
import { propUrl, STREET_PROPS, type PropModel, type PropSpot } from './locations';

const ktxByRenderer = new WeakMap<WebGLRenderer, KTX2Loader>();

function sharedKtx(gl: WebGLRenderer): KTX2Loader {
  const existing = ktxByRenderer.get(gl);
  if (existing) return existing;
  const loader = new KTX2Loader().setTranscoderPath(KTX2_TRANSCODER_PATH);
  loader.detectSupport(gl);
  ktxByRenderer.set(gl, loader);
  return loader;
}

function prepare(root: Object3D) {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      const mat = material as MeshStandardMaterial;
      mat.fog = false;
      if (mat.alphaTest > 0) mat.alphaTest = Math.max(mat.alphaTest, 0.35);
    }
  });
}

function usePropTemplate(url: string): Object3D | null {
  const gl = useThree((state) => state.gl);
  const [template, setTemplate] = useState<Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(sharedKtx(gl));
    void MeshoptDecoder.ready.then(() => {
      if (!alive) return;
      loader.load(url, (gltf) => {
        if (!alive) return;
        prepare(gltf.scene);
        setTemplate(gltf.scene);
      }, undefined, (error) => {
        console.warn('Street prop failed to load', url, error);
      });
    });
    return () => {
      alive = false;
    };
  }, [gl, url]);
  return template;
}

function PropGroup({ model, spots }: { model: PropModel; spots: PropSpot[] }) {
  const template = usePropTemplate(propUrl(model));
  const clones = useMemo(() => (template ? spots.map(() => template.clone(true)) : []), [template, spots]);
  if (!template) return null;
  return (
    <group>
      {clones.map((clone, index) => {
        const spot = spots[index];
        return (
          <primitive
            key={`${model}-${index}`}
            object={clone}
            position={[spot.x, 0, spot.z]}
            rotation={[0, spot.ry, 0]}
          />
        );
      })}
    </group>
  );
}

const MODELS: PropModel[] = ['anthurium', 'barrel', 'trash', 'gazania'];

/** CC0 street props. Omitted on low so older phones only keep the sky and court maps. */
export function StreetProps({ quality }: { quality: Quality }) {
  if (quality === 'low') return null;
  return (
    <group>
      {MODELS.map((model) => (
        <PropGroup key={model} model={model} spots={STREET_PROPS.filter((spot) => spot.model === model)} />
      ))}
    </group>
  );
}

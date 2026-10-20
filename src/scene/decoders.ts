import type { GLTFLoader } from 'three-stdlib';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { useGLTF } from '@react-three/drei';

/** Local Draco decoder. drei's default points at gstatic; this replaces it. */
export const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}decoders/draco/`;

/** Local Basis / KTX2 transcoder. Never a CDN path. */
export const KTX2_TRANSCODER_PATH = `${import.meta.env.BASE_URL}decoders/basis/`;

useGLTF.setDecoderPath(DRACO_DECODER_PATH);

/** Attach a KTX2 transcoder that reads the bundled wasm. Does not probe the GPU. */
export function attachLocalDecoders(loader: GLTFLoader) {
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(KTX2_TRANSCODER_PATH);
  // drei's loader types come from three-stdlib; the runtime class is three's.
  loader.setKTX2Loader(ktx2 as never);
}

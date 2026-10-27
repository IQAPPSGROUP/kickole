import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, Texture, type Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HAIR_COLORS, SKIN_TONES, type PlayerBody } from '../game/appearance';
import { composePlayerSkin } from '../game/skins';
import { meshIsPhotographedFace, resolveDrawnRgb } from './bodyColour';
import { paintKitClothColours, paintPreviewColours } from './playerPaint';

/**
 * Dark texel the old hair draw multiplied into the swatch. Male: the head
 * photograph at the hair UVs. Female: the hair photograph at those UVs.
 * Neither mesh has vertex colours. A near-black result means the swatch
 * never became the colour on screen.
 */
const HAIR_TEXEL: Record<PlayerBody, readonly [number, number, number]> = {
  male: [21, 13, 8],
  female: [28, 17, 15],
};

/** A cheek texel on the photographed face. The full swatch crushes this. */
const CHEEK: readonly [number, number, number] = [180, 120, 90];

const SKIN_SAMPLES = ['#3B2418', '#8D5A3C', '#E8B48F', '#F2CDAA'] as const;

/** Male head bind span. Crown is the top of that span; the nose and mouth sit lower. */
const HEAD_MIN = 0.619;
const HEAD_SPAN = 0.381;
const CROWN = { y: HEAD_MIN + HEAD_SPAN * 0.9 };
const CHEEK_PLACE = { y: HEAD_MIN + HEAD_SPAN * 0.45 };

function swatchRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function maxDelta(drawn: readonly [number, number, number], swatch: readonly [number, number, number]): number {
  return Math.max(Math.abs(drawn[0] - swatch[0]), Math.abs(drawn[1] - swatch[1]), Math.abs(drawn[2] - swatch[2]));
}

function paint(materials: MeshStandardMaterial[], body: PlayerBody, skinTone: string, hairColor: string) {
  const skin = composePlayerSkin({
    body,
    skinTone,
    hairColor,
    kitColourId: 'neutral',
    clothing: { shirt: '#ffffff', shirtTrim: '#111111', shorts: '#111111', socks: '#ffffff' },
  });
  paintPreviewColours(materials, skin);
  paintKitClothColours(materials, skin)?.dispose();
}

function player(body: PlayerBody) {
  const texel = HAIR_TEXEL[body];
  const hair = new MeshStandardMaterial({ name: 'Hair', color: '#ffffff' });
  hair.map = new Texture();
  const face = new MeshStandardMaterial({ name: 'Skin', color: '#ffffff' });
  face.userData.headPhoto = true;
  face.userData.facePhoto = true;
  face.userData.headMin = HEAD_MIN;
  face.userData.headSpan = HEAD_SPAN;
  face.map = new Texture();
  const bodySkin = new MeshStandardMaterial({ name: 'Skin', color: '#ffffff' });
  const eyes = new MeshStandardMaterial({ name: 'Eyes', color: '#445566' });
  const mouth = new MeshStandardMaterial({ name: 'InnerMouth', color: '#111111' });
  const materials = [hair, bodySkin, eyes, mouth, ...(face ? [face] : [])];
  return { hair, face, bodySkin, eyes, mouth, materials, texel };
}

describe('drawn hair and face colour', () => {
  it('draws every hair swatch close to itself on both bodies, and keeps a dark skin face readable', () => {
    expect(HAIR_COLORS.length).toBeGreaterThan(0);
    expect(SKIN_TONES).toEqual(expect.arrayContaining([...SKIN_SAMPLES]));
    for (const body of ['male', 'female'] as const) {
      for (const skinTone of SKIN_SAMPLES) {
        const hairs = ['#F5E6C8', '#6B2D5C', '#C9822B', ...HAIR_COLORS.filter((hex) => hex !== '#F5E6C8' && hex !== '#6B2D5C' && hex !== '#C9822B')];
        for (const hairColor of hairs) {
          const mats = player(body);
          paint(mats.materials, body, skinTone, hairColor);
          const drawn = resolveDrawnRgb(mats.hair, mats.texel);
          const target = swatchRgb(hairColor);
          expect(maxDelta(drawn, target), `${body} ${skinTone} ${hairColor} hair ${drawn.join(',')}`).toBeLessThanOrEqual(10);
          const crown = resolveDrawnRgb(mats.face, mats.texel, CROWN);
          expect(maxDelta(crown, target), `${body} ${skinTone} ${hairColor} crown ${crown.join(',')}`).toBeLessThanOrEqual(10);
          if (target[0] > 40 || target[1] > 40 || target[2] > 40) {
            expect(Math.max(...crown), `${body} ${hairColor} crown not black`).toBeGreaterThan(40);
          }
          const cheek = resolveDrawnRgb(mats.face, CHEEK, CHEEK_PLACE);
          expect(cheek[0] + cheek[1] + cheek[2], `${body} face`).toBeGreaterThan(160);
          const feature = resolveDrawnRgb(mats.face, mats.texel, CHEEK_PLACE);
          if (hairColor === '#F5E6C8' || hairColor === '#6B2D5C' || hairColor === '#C9822B') {
            expect(maxDelta(feature, crown), `${body} ${skinTone} ${hairColor} nose ${feature.join(',')}`).toBeGreaterThan(20);
          }
          expect(mats.eyes.color.getHexString(), `${body} eyes`).toBe('445566');
          const shader = {
            uniforms: {} as Record<string, { value: { getHexString: () => string } }>,
            vertexShader: '#include <common>\n#include <begin_vertex>\n',
            fragmentShader: '#include <common>\n#include <map_fragment>\n',
          };
          mats.face.onBeforeCompile(shader as never, null as never);
          expect(shader.fragmentShader, `${body} face shader`).toContain('uFaceHair');
          expect(shader.vertexShader, `${body} face shader`).toContain('vHeadY');
          expect(shader.uniforms.uFaceHair.value.getHexString(), `${body} ${hairColor}`).toBe(hairColor.slice(1).toLowerCase());
          expect(mats.bodySkin.color.getHexString(), `${body} body`).toBe(skinTone.slice(1).toLowerCase());
          expect(mats.mouth.color.getHexString(), `${body} mouth`).toBe('111111');
        }
      }
    }
  });

  it('finds a Hair material and no vertex colours on both shipped players', () => {
    for (const file of ['public/models/kickole_player_v4.glb', 'public/models/kickole_player_v4_female.glb']) {
      const bytes = readFileSync(file);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const length = view.getUint32(12, true);
      const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
        materials: { name: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
        meshes: { primitives: { material: number; attributes: Record<string, number> }[] }[];
      };
      const hair = json.materials.filter((material) => material.name === 'Hair');
      expect(hair, file).toHaveLength(1);
      expect(hair[0]?.pbrMetallicRoughness?.baseColorTexture, file).toBeDefined();
      expect(json.materials.filter((material) => material.name === 'Skin').length, file).toBeGreaterThan(0);
      for (const mesh of json.meshes) {
        for (const prim of mesh.primitives) {
          expect(prim.attributes.COLOR_0, file).toBeUndefined();
          if (json.materials[prim.material]?.name === 'Hair') expect(prim.attributes.TEXCOORD_0, file).toBeDefined();
        }
      }
    }
  });

  it('keeps the head skin as a photograph and lets the limb skin take the swatch', async () => {
    (globalThis as { self?: typeof globalThis }).self ??= globalThis;
    await MeshoptDecoder.ready;
    for (const file of ['public/models/kickole_player_v4.glb', 'public/models/kickole_player_v4_female.glb']) {
      const buf = readFileSync(file);
      const gltf = await new Promise<{ scene: { traverse: (fn: (obj: Mesh) => void) => void } }>((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        loader.register(() => ({ name: 'KHR_texture_basisu', loadTexture: () => Promise.resolve(new Texture()) }));
        loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (parsed) => resolve(parsed as never), reject);
      });
      let head = 0;
      let limbs = 0;
      gltf.scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh) return;
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (!material || material.name !== 'Skin') return;
        if (meshIsPhotographedFace(mesh) || material.userData.headPhoto === true) head += 1;
        else limbs += 1;
      });
      expect(head, file).toBe(1);
      expect(limbs, file).toBeGreaterThan(0);
    }
  });
});

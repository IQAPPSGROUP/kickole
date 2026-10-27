import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, type Material } from 'three';
import type { PlayerBody } from '../game/appearance';
import { KIT_COLOURS, clothingFor } from '../game/kitColours';
import { composePlayerSkin, type Skin } from '../game/skins';
import { paintKitClothColours, paintPreviewColours } from './playerPaint';

const SKIN_TONE = '#3B2418';
const HAIR_COLOUR = '#F5E6C8';
const BODIES: readonly PlayerBody[] = ['male', 'female'];

function hex(material: MeshStandardMaterial): string {
  return material.color.getHexString();
}

/** Materials named the way the GLB player is named. Hair starts white, as the model leaves it. */
function playerMaterials(body: PlayerBody) {
  const skinMat = new MeshStandardMaterial({ name: 'Skin', color: '#ffffff' });
  const faceMat = body === 'male'
    ? new MeshStandardMaterial({ name: 'Skin', color: '#ffffff' })
    : null;
  if (faceMat) {
    faceMat.userData.headPhoto = true;
    faceMat.userData.facePhoto = true;
  }
  const hairMat = new MeshStandardMaterial({ name: 'Hair', color: '#ffffff' });
  const eyeMat = new MeshStandardMaterial({ name: 'Eyes', color: '#445566' });
  const mouthMat = new MeshStandardMaterial({ name: 'InnerMouth', color: '#111111' });
  const shirtMat = new MeshStandardMaterial({ name: 'Shirt', color: '#ffffff' });
  const trimMat = new MeshStandardMaterial({ name: 'Shirt_Trim', color: '#ffffff' });
  const shortsMat = new MeshStandardMaterial({ name: 'Shorts', color: '#ffffff' });
  const socksMat = new MeshStandardMaterial({ name: 'Socks', color: '#ffffff' });
  const materials: Material[] = [skinMat, hairMat, eyeMat, mouthMat, shirtMat, trimMat, shortsMat, socksMat];
  if (faceMat) materials.splice(1, 0, faceMat);
  return { skinMat, faceMat, hairMat, eyeMat, mouthMat, shirtMat, shortsMat, materials };
}

/** The same two passes GlbCharacter runs before the frame is drawn. */
function paintForRender(materials: readonly Material[], skin: Skin) {
  paintPreviewColours(materials, skin);
  paintKitClothColours(materials, skin)?.dispose();
}

function expectRendered(body: PlayerBody, kitId: string, before: Skin, after: Skin) {
  const kit = KIT_COLOURS.find((option) => option.id === kitId);
  if (!kit) throw new Error(`missing kit ${kitId}`);
  const mats = playerMaterials(body);
  // Mount on the previous colours, then apply the new swatch to the same materials.
  paintForRender(mats.materials, before);
  paintForRender(mats.materials, after);
  expect(hex(mats.skinMat), `${body} ${kit.id} skin`).toBe('3b2418');
  if (mats.faceMat) expect(hex(mats.faceMat), `${body} ${kit.id} head`).toBe('ffffff');
  expect(hex(mats.hairMat), `${body} ${kit.id} hair`).toBe('f5e6c8');
  expect(hex(mats.skinMat), `${body} ${kit.id} skin changed`).not.toBe(before.body.skin.slice(1).toLowerCase());
  expect(hex(mats.hairMat), `${body} ${kit.id} hair changed`).not.toBe(before.body.hair.slice(1).toLowerCase());
  expect(hex(mats.eyeMat), `${body} ${kit.id} eyes`).toBe('445566');
  expect(hex(mats.mouthMat), `${body} ${kit.id} mouth`).toBe('111111');
  expect(hex(mats.shortsMat), `${body} ${kit.id} shorts`).toBe(kit.shorts.slice(1).toLowerCase());
  const uniforms = mats.shirtMat.userData.kitUniforms as { uKitMain: { value: { getHexString: () => string } } };
  expect(uniforms.uKitMain.value.getHexString(), `${body} ${kit.id} shirt`).toBe(kit.shirt.slice(1).toLowerCase());
}

describe('rendered wardrobe colours', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('changes skin and hair on every kit and keeps those colours after a reload', async () => {
    expect(KIT_COLOURS).toHaveLength(212);
    vi.resetModules();
    const data: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in data ? data[key] : null),
      setItem: (key: string, value: string) => { data[key] = value; },
      removeItem: (key: string) => { delete data[key]; },
    });
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
    data['kicky.settings.v1'] = JSON.stringify({ sound: false, vibration: false, quality: 'high' });
    const { GameController } = await import('../game/controller');
    const first = new GameController();
    const starter = first.getSnapshot().save.appearance;
    first.setAppearance({
      ...starter,
      skinTone: SKIN_TONE,
      hairColor: HAIR_COLOUR,
    });

    for (const body of BODIES) {
      first.chooseBody(body);
      for (const kit of KIT_COLOURS) {
        first.setKitColour(kit.id);
        const after = first.getSnapshot().skin;
        const before = composePlayerSkin({
          ...starter,
          body,
          kitColourId: kit.id,
          clothing: clothingFor(kit),
        });
        expect(after.body.skin, kit.id).toBe(SKIN_TONE);
        expect(after.body.hair, kit.id).toBe(HAIR_COLOUR);
        expectRendered(body, kit.id, before, after);
      }
    }

    expect(JSON.parse(data['kicky.save.v1']).appearance).toMatchObject({
      skinTone: SKIN_TONE,
      hairColor: HAIR_COLOUR,
    });

    vi.resetModules();
    const { GameController: Reloaded } = await import('../game/controller');
    const second = new Reloaded();
    const saved = second.getSnapshot().save.appearance;
    expect(saved.skinTone).toBe(SKIN_TONE);
    expect(saved.hairColor).toBe(HAIR_COLOUR);
    for (const body of BODIES) {
      for (const kit of KIT_COLOURS) {
        const after = composePlayerSkin({
          ...saved,
          body,
          kitColourId: kit.id,
          clothing: clothingFor(kit),
        });
        const before = composePlayerSkin({
          ...starter,
          body,
          kitColourId: kit.id,
          clothing: clothingFor(kit),
        });
        expectRendered(body, kit.id, before, after);
      }
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Color, MeshStandardMaterial } from 'three';
import { applyWardrobeBodyColours } from './bodyColour';

function hex(material: MeshStandardMaterial): string {
  return material.color.getHexString();
}

describe('wardrobe body colours', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('changes the skin and hair materials and keeps that colour after a reload', async () => {
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
    const before = first.getSnapshot().skin;
    const skinMat = new MeshStandardMaterial({ name: 'Skin', color: '#ffffff' });
    const faceMat = new MeshStandardMaterial({ name: 'Skin', color: '#ffffff' });
    faceMat.userData.headPhoto = true;
    const hairMat = new MeshStandardMaterial({ name: 'Hair', color: '#ffffff' });
    const eyeMat = new MeshStandardMaterial({ name: 'Eyes', color: '#445566' });
    applyWardrobeBodyColours([skinMat, faceMat, hairMat, eyeMat], before);
    expect(hex(skinMat)).toBe(new Color(before.body.skin).getHexString());
    expect(hex(faceMat)).toBe(hex(skinMat));
    expect(hex(hairMat)).toBe(new Color(before.body.hair).getHexString());
    const eyes = hex(eyeMat);

    first.setAppearance({
      ...first.getSnapshot().save.appearance,
      skinTone: '#3B2418',
      hairColor: '#F5E6C8',
    });
    const next = first.getSnapshot().skin;
    applyWardrobeBodyColours([skinMat, faceMat, hairMat, eyeMat], next);
    expect(hex(skinMat)).toBe('3b2418');
    expect(hex(faceMat)).toBe('3b2418');
    expect(hex(hairMat)).toBe('f5e6c8');
    expect(hex(skinMat)).not.toBe(new Color(before.body.skin).getHexString());
    expect(hex(hairMat)).not.toBe(new Color(before.body.hair).getHexString());
    expect(hex(eyeMat)).toBe(eyes);
    expect(JSON.parse(data['kicky.save.v1']).appearance).toMatchObject({
      skinTone: '#3B2418',
      hairColor: '#F5E6C8',
    });

    vi.resetModules();
    const { GameController: Reloaded } = await import('../game/controller');
    const second = new Reloaded();
    expect(second.getSnapshot().save.appearance.skinTone).toBe('#3B2418');
    expect(second.getSnapshot().save.appearance.hairColor).toBe('#F5E6C8');
    const reloadedSkin = new MeshStandardMaterial({ name: 'Skin' });
    const reloadedHair = new MeshStandardMaterial({ name: 'Hair' });
    applyWardrobeBodyColours([reloadedSkin, reloadedHair], second.getSnapshot().skin);
    expect(hex(reloadedSkin)).toBe('3b2418');
    expect(hex(reloadedHair)).toBe('f5e6c8');
  });
});

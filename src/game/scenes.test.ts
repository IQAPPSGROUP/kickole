import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_ID, SCENES, isSceneId, sceneById } from './scenes';

describe('scenes', () => {
  it('opens on the Brazilian beach', () => {
    expect(DEFAULT_SCENE_ID).toBe('beach');
    expect(SCENES[0].subtitle).toBe('BRAZILIAN BEACH');
    expect(sceneById(undefined).id).toBe('beach');
    expect(sceneById('nope').id).toBe('beach');
  });

  it('keeps the street court as another place', () => {
    expect(isSceneId('rua')).toBe(true);
    expect(sceneById('rua').place).toBe('FUTEBOL DE RUA');
    expect(isSceneId('beach')).toBe(true);
  });
});

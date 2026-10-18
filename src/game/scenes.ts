/**
 * Play locations. Physics stays on the same patch of ground; only the set dressing changes.
 * The first entry is the default, so a new install opens on the beach.
 */
export const SCENES = [
  {
    id: 'beach',
    name: 'Beach',
    place: 'PRAIA',
    subtitle: 'BRAZILIAN BEACH',
    sky: '#8fd4f2',
    fogNear: 14,
    fogFar: 32,
    hemiSky: '#eaf7ff',
    hemiGround: '#c9a15a',
    hemi: 1.15,
    ambient: 0.28,
    sun: '#fff1c4',
    sunIntensity: 3.1,
    sunPosition: [4, 8, 2.5] as const,
    shadow: '#6a4a28',
  },
  {
    id: 'rua',
    name: 'Street',
    place: 'FUTEBOL DE RUA',
    subtitle: 'STREET FREESTYLE',
    sky: '#24545c',
    fogNear: 12,
    fogFar: 26,
    hemiSky: '#ffe6c4',
    hemiGround: '#1a3330',
    hemi: 0.7,
    ambient: 0.16,
    sun: '#ffd4a4',
    sunIntensity: 2.9,
    sunPosition: [5.2, 7.2, 3.4] as const,
    shadow: '#071418',
  },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];
export type GameScene = (typeof SCENES)[number];

export const DEFAULT_SCENE_ID: SceneId = SCENES[0].id;

export function isSceneId(id: string): id is SceneId {
  return SCENES.some((scene) => scene.id === id);
}

export function sceneById(id: string | undefined): GameScene {
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0];
}

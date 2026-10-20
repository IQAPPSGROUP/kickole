import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DirectionalLight, OrthographicCamera } from 'three';
import type { GameEngine } from '../engine/engine';
import type { Quality } from '../game/storage';
import { STREET_KEY } from './daylight';
import { profileFor } from './qualityTier';
import { shadowFocus } from './shadowFit';

const PLAYER = { x: 0, z: 0 };
const SUN_OFFSET: readonly [number, number, number] = [6.2, 8.4, 2.4];

/**
 * Street key light. High uses PCSS inside a tight box around the player.
 * Medium uses variance shadows in a slightly wider box. The sun direction stays fixed.
 */
export function KeyLight({ quality, engine }: { quality: Quality; engine: GameEngine }) {
  const scene = useThree((state) => state.scene);
  const light = useMemo(() => {
    const profile = profileFor(quality);
    const sun = new DirectionalLight(STREET_KEY.color, STREET_KEY.intensity);
    sun.castShadow = profile.shadows !== 'none';
    sun.shadow.mapSize.set(profile.shadowMap || 512, profile.shadowMap || 512);
    sun.shadow.bias = profile.shadowFilter === 'pcss' ? -0.0016 : -0.00045;
    sun.shadow.normalBias = profile.shadowFilter === 'pcss' ? 0.04 : 0.02;
    sun.shadow.radius = profile.shadowRadius;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 24;
    const extent = profile.shadowExtent || 4;
    const camera = sun.shadow.camera as OrthographicCamera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    sun.position.set(SUN_OFFSET[0], SUN_OFFSET[1], SUN_OFFSET[2]);
    return sun;
  }, [quality]);

  useEffect(() => {
    scene.add(light);
    scene.add(light.target);
    return () => {
      scene.remove(light);
      scene.remove(light.target);
      light.dispose();
    };
  }, [scene, light]);

  useFrame(() => {
    const profile = profileFor(quality);
    if (profile.shadows === 'none') return;
    const [x, z] = shadowFocus(PLAYER, engine.ball, profile.shadowExtent);
    light.target.position.set(x, 0, z);
    light.target.updateMatrixWorld();
    light.position.set(x + SUN_OFFSET[0], SUN_OFFSET[1], z + SUN_OFFSET[2]);
    const camera = light.shadow.camera as OrthographicCamera;
    const extent = profile.shadowExtent;
    if (camera.right !== extent) {
      camera.left = -extent;
      camera.right = extent;
      camera.top = extent;
      camera.bottom = -extent;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

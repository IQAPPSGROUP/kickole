import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, Group, InstancedMesh, Object3D } from 'three';
import type { GameEngine } from '../engine/engine';
import type { Quality } from '../game/storage';
import { ENVIRONMENT_THEME } from './environment';
import { crowdBob, prefersReducedMotion, sceneLifeBudget } from './juice';
import { createPennantGeometry } from './pennant';

const CROWD = ['#FF4F9A', '#FFD93D', '#00B8A9', '#6C5CE7', '#FF8A5B', '#F8F9FB'];

/**
 * Cheap background motion: instanced crowd, a few palms, flags, clouds,
 * birds and balloons. Counts come from the quality tier. Reduced motion
 * leaves the crowd and trees in place.
 */
export function SceneLife({ engine, quality }: { engine: GameEngine; quality: Quality }) {
  const reduced = prefersReducedMotion();
  const budget = sceneLifeBudget(quality, reduced);
  const legacy = ENVIRONMENT_THEME !== 'alley';
  return (
    <group>
      {ENVIRONMENT_THEME === 'beach' && <Crowd count={budget.crowd} engine={engine} reduced={reduced} />}
      {legacy && <Palms count={budget.palms} sway={budget.buntingSway} />}
      {legacy && <Flags count={budget.flags} sway={budget.buntingSway} />}
      {legacy && <Clouds count={budget.clouds} drift={budget.cameraSway} />}
      {legacy && budget.birds > 0 && <Birds count={budget.birds} />}
      {legacy && budget.balloons > 0 && <Balloons count={budget.balloons} />}
      {legacy && budget.lightSweep && <LightSweep />}
    </group>
  );
}

function Crowd({ count, engine, reduced }: { count: number; engine: GameEngine; reduced: boolean }) {
  const bodies = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);
  const spots = useMemo(() => Array.from({ length: count }, (_, i) => {
    const u = count <= 1 ? 0.5 : i / (count - 1);
    return { x: -3.35 + u * 6.7, z: -3.02 - (i % 3) * 0.1, phase: i * 0.65 };
  }), [count]);

  const paint = (time: number, bob: number, colors: boolean) => {
    const body = bodies.current;
    const head = heads.current;
    if (!body || !head) return;
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      if (!spot) continue;
      const wave = Math.sin(time * (2.2 + (i % 3) * 0.25) + spot.phase) * bob;
      dummy.position.set(spot.x, 2.12 + wave, spot.z);
      dummy.rotation.set(wave * 1.6, 0, wave);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 0.24;
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
      if (colors) {
        body.setColorAt(i, tint.set(CROWD[i % CROWD.length]));
        head.setColorAt(i, tint.set('#F8F9FB'));
      }
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (colors && body.instanceColor) body.instanceColor.needsUpdate = true;
    if (colors && head.instanceColor) head.instanceColor.needsUpdate = true;
  };

  useLayoutEffect(() => { paint(0, 0, true); }, [count]);
  useFrame((state) => {
    const bob = crowdBob(engine.streak, reduced);
    if (bob === 0) return;
    paint(state.clock.elapsedTime, bob, false);
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.2, 0.28, 0.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshBasicMaterial color="#F8F9FB" />
      </instancedMesh>
    </group>
  );
}

function Palms({ count, sway }: { count: number; sway: boolean }) {
  const ref = useRef<Group>(null);
  const spots = useMemo(() => {
    const xs = [-3.55, 3.55, -2.35, 2.35];
    return xs.slice(0, count).map((x, i) => ({ x, z: -2.15 - (i % 2) * 0.35 }));
  }, [count]);
  useFrame((state) => {
    const group = ref.current;
    if (!group || !sway) return;
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      child.rotation.z = Math.sin(t * 1.25 + i) * 0.055;
    });
  });
  return (
    <group ref={ref}>
      {spots.map((spot) => (
        <group key={`${spot.x}`} position={[spot.x, 0, spot.z]}>
          <mesh position={[0, 1.05, 0]}>
            <cylinderGeometry args={[0.05, 0.09, 2.1, 6]} />
            <meshBasicMaterial color="#FF8A5B" />
          </mesh>
          {[0, 1, 2, 3].map((leaf) => (
            <mesh key={leaf} position={[0, 2.05, 0]} rotation={[0.55, leaf * 1.15, 0.35]}>
              <coneGeometry args={[0.16, 0.62, 4]} />
              <meshBasicMaterial color="#00B8A9" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Flags({ count, sway }: { count: number; sway: boolean }) {
  const ref = useRef<Group>(null);
  const spots = useMemo(() => {
    const xs = [-4.15, 4.15, -1.2, 1.4];
    return xs.slice(0, count);
  }, [count]);
  useFrame((state) => {
    const group = ref.current;
    if (!group || !sway) return;
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      const cloth = child.children[1];
      if (cloth) cloth.rotation.y = Math.sin(t * 2.4 + i) * 0.45;
    });
  });
  const colors = ['#FF4F9A', '#FFD93D', '#6C5CE7', '#00B8A9'];
  const pennants = useMemo(() => Array.from({ length: count }, () => createPennantGeometry()), [count]);
  useEffect(() => () => { pennants.forEach((geometry) => geometry.dispose()); }, [pennants]);
  return (
    <group ref={ref}>
      {spots.map((x, i) => (
        <group key={x} position={[x, 0, -3.15]}>
          <mesh position={[0, 1.7, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 3.4, 5]} />
            <meshBasicMaterial color="#fff6ea" />
          </mesh>
          <mesh position={[0.02, 3.4, 0]}>
            <primitive object={pennants[i]} attach="geometry" />
            <meshBasicMaterial color={colors[i % colors.length]} side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Clouds({ count, drift }: { count: number; drift: boolean }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const group = ref.current;
    if (!group || !drift) return;
    group.children.forEach((child, i) => {
      child.position.x += dt * (0.12 + i * 0.02);
      if (child.position.x > 8) child.position.x = -8;
    });
  });
  return (
    <group ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[-6 + i * 2.6, 6.2 + (i % 2) * 0.5, -10]}>
          <planeGeometry args={[1.6 + (i % 3) * 0.3, 0.55]} />
          <meshBasicMaterial color="#F8F9FB" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Birds({ count }: { count: number }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const group = ref.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      child.position.x = Math.sin(t * 0.35 + i) * 3.2 + i * 0.4;
      child.position.y = 5.4 + Math.sin(t * 1.6 + i) * 0.25;
      child.rotation.z = Math.sin(t * 6 + i) * 0.4;
    });
  });
  return (
    <group ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[i, 5.4, -8]}>
          <coneGeometry args={[0.12, 0.28, 3]} />
          <meshBasicMaterial color="#222831" />
        </mesh>
      ))}
    </group>
  );
}

function Balloons({ count }: { count: number }) {
  const ref = useRef<Group>(null);
  const colors = ['#FF4F9A', '#FFD93D', '#00B8A9', '#6C5CE7', '#FF8A5B'];
  useFrame((state) => {
    const group = ref.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      child.position.y = 3.1 + Math.sin(t * 0.8 + i) * 0.18 + (i % 2) * 0.3;
    });
  });
  return (
    <group ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[-2.2 + i * 1.05, 3.2, -2.7]}>
          <sphereGeometry args={[0.16, 8, 6]} />
          <meshBasicMaterial color={colors[i % colors.length]} />
        </mesh>
      ))}
    </group>
  );
}

function LightSweep() {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const group = ref.current;
    if (!group) return;
    group.position.x = Math.sin(state.clock.elapsedTime * 0.28) * 3.2;
  });
  return (
    <group ref={ref} position={[0, 2.2, -3.35]}>
      <mesh>
        <planeGeometry args={[1.4, 3.2]} />
        <meshBasicMaterial color="#FFD93D" transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}

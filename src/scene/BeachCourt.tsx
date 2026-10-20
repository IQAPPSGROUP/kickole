import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, InstancedMesh, Object3D } from 'three';
import type { Quality } from '../game/storage';
import {
  BEACH_BUNTING_COUNT,
  BEACH_FESTA,
  BEACH_FLAG_X,
  BEACH_STREAMER_COUNT,
  beachBuntingSpot,
  beachFlagSpot,
  beachPoleSpot,
  beachStreamerSpot,
} from './beachCarnival';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { sandMapSet } from './locations';
import { useStreetMaps } from './streetMaterials';
import { createPennantGeometry, placeRope } from './pennant';
import { prefersReducedMotion, sceneLifeBudget } from './juice';

/** Pennants behind the rope line. The beach GLB stays the scenery. */
function BeachCarnival({ sway }: { sway: boolean }) {
  const buntingRef = useRef<InstancedMesh>(null);
  const ropeRef = useRef<InstancedMesh>(null);
  const flagRef = useRef<InstancedMesh>(null);
  const poleRef = useRef<InstancedMesh>(null);
  const streamerRef = useRef<InstancedMesh>(null);
  const buntingGeo = useMemo(() => createPennantGeometry(), []);
  const flagGeo = useMemo(() => createPennantGeometry(), []);
  useEffect(() => () => {
    buntingGeo.dispose();
    flagGeo.dispose();
  }, [buntingGeo, flagGeo]);
  const dummy = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);
  const paint = (time: number, colors: boolean) => {
    const flutter = (u: number) => (sway ? Math.sin(time * 2.1 + u * 7) * 0.07 : 0);
    const bunting = buntingRef.current;
    if (bunting) {
      for (let i = 0; i < BEACH_BUNTING_COUNT; i++) {
        const u = i / (BEACH_BUNTING_COUNT - 1);
        const spot = beachBuntingSpot(i, flutter(u));
        dummy.position.set(spot.x, spot.y, spot.z);
        dummy.rotation.set(flutter(u) * 0.5, 0, flutter(u));
        dummy.scale.set(1.05, 1.05, 1);
        dummy.updateMatrix();
        bunting.setMatrixAt(i, dummy.matrix);
        if (colors) bunting.setColorAt(i, tint.set(BEACH_FESTA[i % BEACH_FESTA.length] ?? BEACH_FESTA[0]));
      }
      bunting.instanceMatrix.needsUpdate = true;
      if (colors && bunting.instanceColor) bunting.instanceColor.needsUpdate = true;
      const rope = ropeRef.current;
      if (rope) {
        for (let i = 0; i < BEACH_BUNTING_COUNT - 1; i++) {
          const a = beachBuntingSpot(i, flutter(i / (BEACH_BUNTING_COUNT - 1)));
          const b = beachBuntingSpot(i + 1, flutter((i + 1) / (BEACH_BUNTING_COUNT - 1)));
          placeRope(dummy, a.x, a.y, a.z, b.x, b.y, b.z);
          rope.setMatrixAt(i, dummy.matrix);
        }
        rope.instanceMatrix.needsUpdate = true;
      }
    }
    BEACH_FLAG_X.forEach((_, i) => {
      const u = i / (BEACH_FLAG_X.length - 1);
      const pole = beachPoleSpot(i);
      if (poleRef.current) {
        dummy.position.set(pole.x, pole.y, pole.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poleRef.current.setMatrixAt(i, dummy.matrix);
      }
      if (flagRef.current) {
        const flag = beachFlagSpot(i, flutter(u));
        dummy.position.set(flag.x, flag.y, flag.z);
        dummy.rotation.set(0, 0.25, flutter(u) * 1.3);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        flagRef.current.setMatrixAt(i, dummy.matrix);
        if (colors) flagRef.current.setColorAt(i, tint.set(BEACH_FESTA[i % BEACH_FESTA.length] ?? BEACH_FESTA[0]));
      }
    });
    if (poleRef.current) poleRef.current.instanceMatrix.needsUpdate = true;
    if (flagRef.current) {
      flagRef.current.instanceMatrix.needsUpdate = true;
      if (colors && flagRef.current.instanceColor) flagRef.current.instanceColor.needsUpdate = true;
    }
    const streamers = streamerRef.current;
    if (streamers) {
      for (let i = 0; i < BEACH_STREAMER_COUNT; i++) {
        const u = i / (BEACH_STREAMER_COUNT - 1);
        const spot = beachStreamerSpot(i, flutter(u));
        dummy.position.set(spot.x, spot.y, spot.z);
        dummy.rotation.set(flutter(u), 0, flutter(u));
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        streamers.setMatrixAt(i, dummy.matrix);
        if (colors) streamers.setColorAt(i, tint.set(BEACH_FESTA[(i + 3) % BEACH_FESTA.length] ?? BEACH_FESTA[0]));
      }
      streamers.instanceMatrix.needsUpdate = true;
      if (colors && streamers.instanceColor) streamers.instanceColor.needsUpdate = true;
    }
  };
  useLayoutEffect(() => { paint(0, true); }, []);
  useFrame((state) => { if (sway) paint(state.clock.elapsedTime, false); });
  return (
    <group>
      <instancedMesh ref={ropeRef} args={[undefined, undefined, BEACH_BUNTING_COUNT - 1]} frustumCulled={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        <meshStandardMaterial color="#fff6ea" roughness={0.55} />
      </instancedMesh>
      <instancedMesh ref={buntingRef} args={[undefined, undefined, BEACH_BUNTING_COUNT]} frustumCulled={false}>
        <primitive object={buntingGeo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.48} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={poleRef} args={[undefined, undefined, BEACH_FLAG_X.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.02, 0.028, 2.5, 6]} />
        <meshStandardMaterial color="#fff6ea" roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={flagRef} args={[undefined, undefined, BEACH_FLAG_X.length]} frustumCulled={false}>
        <primitive object={flagGeo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.45} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={streamerRef} args={[undefined, undefined, BEACH_STREAMER_COUNT]} frustumCulled={false}>
        <planeGeometry args={[0.07, 0.72]} />
        <meshStandardMaterial side={DoubleSide} roughness={0.45} metalness={0} />
      </instancedMesh>
    </group>
  );
}


/** Goal frame only. The photographed sky is the water if the beach model cannot load. */
function BeachFallback() {
  return <group>
    {[-1.5, 1.5].map(x => <mesh key={x} position={[x, .92, -5.35]}>
      <cylinderGeometry args={[.05, .05, 1.84, 8]} /><meshStandardMaterial color="#f6e8c7" />
    </mesh>)}
    <mesh position={[0, 1.84, -5.35]}><boxGeometry args={[3.1, .09, .09]} /><meshStandardMaterial color="#f6e8c7" /></mesh>
  </group>;
}

/** Visual replacement only: the simulation and player floor remain at their original coordinates. */
export function BeachCourt({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const maps = sandMapSet(quality);
  const playSand = useStreetMaps(maps.color, maps.normal, maps.rough, 4, 3);
  const farSand = useStreetMaps(maps.color, maps.normal, maps.rough, 8, 5);
  return <group>
    <EnvironmentBackdrop quality={quality} theme="beach" fallback={<BeachFallback />} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, -16]} receiveShadow={shadows}>
      <planeGeometry args={[42, 24]} />
      <meshStandardMaterial
        map={farSand.color ?? undefined}
        normalMap={farSand.normal ?? undefined}
        roughnessMap={farSand.rough ?? undefined}
        color={farSand.color ? '#e7d3ae' : '#c4a056'}
        roughness={0.96}
        metalness={0}
        envMapIntensity={0.1}
      />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.9]} receiveShadow={shadows}>
      <planeGeometry args={[16, 10.6]} />
      <meshStandardMaterial
        map={playSand.color ?? undefined}
        normalMap={playSand.normal ?? undefined}
        roughnessMap={playSand.rough ?? undefined}
        normalScale={[0.85, 0.85]}
        color={playSand.color ? '#e4cfa6' : '#c4a056'}
        roughness={playSand.rough ? 0.94 : 0.96}
        metalness={0}
        envMapIntensity={0.1}
      />
    </mesh>
    <BeachCarnival sway={sceneLifeBudget(quality, prefersReducedMotion()).buntingSway} />
    {/* Freestyle circle and touch-area boundary ropes are cosmetic, with no colliders. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .012, 0]}>
      <torusGeometry args={[1.2, .014, 5, quality === 'low' ? 40 : 72]} /><meshStandardMaterial color="#f6e5b9" roughness={1} />
    </mesh>
    {[-3.4, 3.4].map(x => <group key={x}>
      <mesh position={[x, .014, 0]}><boxGeometry args={[.028, .028, 8.8]} /><meshStandardMaterial color="#f7e8c4" /></mesh>
      {[-4.4, 4.4].map(z => <mesh key={z} position={[x, .06, z]}>
        <cylinderGeometry args={[.035, .045, .12, 6]} /><meshStandardMaterial color="#997d55" />
      </mesh>)}
    </group>)}
    {[-4.4, 4.4].map(z => <mesh key={z} position={[0, .014, z]}><boxGeometry args={[6.8, .028, .028]} /><meshStandardMaterial color="#f7e8c4" /></mesh>)}
  </group>;
}

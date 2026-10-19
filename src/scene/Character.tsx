import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';
import { computePose, createPose } from './pose';
import { computePlayerMotion, createPlayerMotion } from './motion';
import { createMotionRig } from './motionRig';

interface Props {
  engine: GameEngine;
  skin: Skin;
  expressive?: boolean;
}

/** Placeholder primitive rig. Swap this component for a GLB-based one that consumes the same Pose. */
export function Character({ engine, skin, expressive = true }: Props) {
  const pose = useMemo(() => createPose(), []);
  const motion = useMemo(() => createPlayerMotion(), []);
  const motionRig = useRef<ReturnType<typeof createMotionRig> | null>(null);
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const thighL = useRef<Group>(null);
  const thighR = useRef<Group>(null);
  const shinL = useRef<Group>(null);
  const shinR = useRef<Group>(null);
  const footL = useRef<Group>(null);
  const footR = useRef<Group>(null);

  useFrame(() => {
    if (!motionRig.current && root.current) motionRig.current = createMotionRig({ root: root.current,
      spine: torso.current ?? undefined, head: head.current ?? undefined, armLeft: armL.current ?? undefined,
      armRight: armR.current ?? undefined, footLeft: footL.current ?? undefined, footRight: footR.current ?? undefined }, { mirrorArmZ: true });
    motionRig.current?.restore();
    computePose(engine, pose);
    if (root.current) { root.current.position.y = pose.bodyY; root.current.rotation.y = pose.bodyYaw; }
    if (torso.current) {
      torso.current.rotation.x = pose.torsoPitch;
      torso.current.rotation.y = pose.torsoYaw;
      torso.current.rotation.z = pose.torsoRoll;
      torso.current.scale.y = 1 + pose.breathe * 0.012;
    }
    if (head.current) {
      head.current.rotation.y = pose.headYaw + pose.neckYaw;
      head.current.rotation.x = pose.headPitch + pose.neckPitch;
    }
    if (armL.current) { armL.current.rotation.z = -pose.armLeft; armL.current.rotation.x = pose.armLeftPitch; }
    if (armR.current) { armR.current.rotation.z = pose.armRight; armR.current.rotation.x = pose.armRightPitch; }
    const apply = (t: Group | null, s: Group | null, f: Group | null, l: typeof pose.legs.left) => {
      if (t) { t.rotation.x = l.thigh; t.rotation.y = l.twist; t.rotation.z = l.abduct; }
      if (s) s.rotation.x = l.knee;
      if (f) { f.rotation.x = l.foot; f.rotation.y = l.ankleYaw; f.rotation.z = l.ankleRoll; }
    };
    apply(thighL.current, shinL.current, footL.current, pose.legs.left);
    apply(thighR.current, shinR.current, footR.current, pose.legs.right);
    // The fallback already tracks the ball procedurally; keep its existing head pitch/yaw.
    if (expressive && !pose.lockMotion) motionRig.current?.apply(computePlayerMotion(engine, motion), false);
  });

  const { clothing, boots, body } = skin;
  const leg = (side: 'left' | 'right') => {
    const x = side === 'left' ? -0.1 : 0.1;
    const thigh = side === 'left' ? thighL : thighR;
    const shin = side === 'left' ? shinL : shinR;
    const foot = side === 'left' ? footL : footR;
    return (
      <group ref={thigh} position={[x, 0.95, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.26, 6, 12]} />
          <meshStandardMaterial color={body.skin} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.14, 0]} castShadow>
          <cylinderGeometry args={[0.105, 0.115, 0.3, 14]} />
          <meshStandardMaterial color={clothing.shorts} roughness={0.7} />
        </mesh>
        <group ref={shin} position={[0, -0.42, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.31, 6, 12]} />
            <meshStandardMaterial color={clothing.socks} roughness={0.8} />
          </mesh>
          <group ref={foot} position={[0, -0.45, 0]}>
            <mesh position={[0, -0.03, 0.07]} castShadow>
              <boxGeometry args={[0.125, 0.09, 0.28]} />
              <meshStandardMaterial color={boots.main} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.08, 0.07]}>
              <boxGeometry args={[0.13, 0.025, 0.29]} />
              <meshStandardMaterial color={boots.sole} roughness={0.6} />
            </mesh>
          </group>
        </group>
      </group>
    );
  };

  return (
    <group ref={root}>
      {leg('left')}
      {leg('right')}
      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[0.34, 0.16, 0.2]} />
        <meshStandardMaterial color={clothing.shorts} roughness={0.7} />
      </mesh>
      <group ref={torso} position={[0, 0.98, 0]}>
        <mesh position={[0, 0.27, 0]} castShadow>
          <capsuleGeometry args={[0.19, 0.28, 8, 16]} />
          <meshStandardMaterial color={clothing.shirt} roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.27, 0.185]}>
          <boxGeometry args={[0.1, 0.5, 0.02]} />
          <meshStandardMaterial color={clothing.shirtTrim} roughness={0.7} />
        </mesh>
        <group position={[0, 0.62, 0]}>
          <mesh position={[0, -0.02, 0]}>
            <cylinderGeometry args={[0.06, 0.07, 0.1, 10]} />
            <meshStandardMaterial color={body.skin} />
          </mesh>
          <group ref={head} position={[0, 0.17, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.17, 24, 20]} />
              <meshStandardMaterial color={body.skin} roughness={0.8} />
            </mesh>
            {(skin.hairStyle ?? 'short') === 'short' && (
              <mesh position={[0, 0.05, -0.02]} scale={[1, 0.85, 1]}>
                <sphereGeometry args={[0.18, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                <meshStandardMaterial color={body.hair} roughness={0.9} />
              </mesh>
            )}
            {(skin.hairStyle ?? 'short') === 'afro' && (
              <mesh position={[0, 0.12, -0.02]} castShadow>
                <sphereGeometry args={[0.2, 14, 12]} />
                <meshStandardMaterial color={body.hair} roughness={0.92} />
              </mesh>
            )}
            {(skin.hairStyle ?? 'short') === 'mohawk' && (
              <mesh position={[0, 0.18, -0.01]} castShadow>
                <boxGeometry args={[0.06, 0.22, 0.22]} />
                <meshStandardMaterial color={body.hair} roughness={0.9} />
              </mesh>
            )}
            {(skin.hairStyle ?? 'short') === 'highTop' && (
              <mesh position={[0, 0.2, -0.02]} castShadow>
                <cylinderGeometry args={[0.14, 0.16, 0.18, 12]} />
                <meshStandardMaterial color={body.hair} roughness={0.9} />
              </mesh>
            )}
            <mesh position={[-0.06, 0.02, 0.155]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#142D35" />
            </mesh>
            <mesh position={[0.06, 0.02, 0.155]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#142D35" />
            </mesh>
          </group>
        </group>
        <group ref={armL} position={[-0.24, 0.48, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.28, 6, 10]} />
            <meshStandardMaterial color={body.skin} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.075, 0.085, 0.14, 12]} />
            <meshStandardMaterial color={clothing.shirt} />
          </mesh>
        </group>
        <group ref={armR} position={[0.24, 0.48, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.28, 6, 10]} />
            <meshStandardMaterial color={body.skin} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.075, 0.085, 0.14, 12]} />
            <meshStandardMaterial color={clothing.shirt} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

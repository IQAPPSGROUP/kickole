import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, LoopOnce, Vector3, LoopRepeat, Material, MeshStandardMaterial, type AnimationAction, type Bone, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';
import { computePose, createPose } from './pose';
import { inspector } from './inspector';
import { computePlayerMotion, createPlayerMotion } from './motion';
import { createMotionRig } from './motionRig';
import {
  ANIMATION_STATES, BONE_NAMES, MATERIAL_NAMES, CHARACTER_MODEL_URL, LOOPING_STATES, selectAnimationState, animationSampleTime, skinMaterialColors, validateModel,
  type AnimationState, type BoneKey,
} from './rig';

interface Props { engine: GameEngine; skin: Skin; onInvalid: () => void; expressive?: boolean }

/**
 * Rigged GLB footballer (see docs/CHARACTER_GLB.md). Plays the named clips when present, otherwise drives the
 * contract bones from the shared procedural pose. Reports an invalid model so the primitive fallback is used.
 */
export function GlbCharacter({ engine, skin, onInvalid, expressive = true }: Props) {
  const gltf = useGLTF(CHARACTER_MODEL_URL);
  const { scene, clips, report, bones, materials } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as Object3D;
    const boneMap: Partial<Record<BoneKey, Bone>> = {};
    const mats = new Map<string, MeshStandardMaterial>();
    const boneNames: string[] = [];
    const matNames: string[] = [];
    root.traverse((o) => {
      if ((o as Bone).isBone) {
        boneNames.push(o.name);
        (Object.keys(BONE_NAMES) as BoneKey[]).forEach((k) => { if (BONE_NAMES[k] === o.name) boneMap[k] = o as Bone; });
      }
      const mesh = o as { isMesh?: boolean; material?: Material | Material[]; castShadow?: boolean };
      if (mesh.isMesh && mesh.material) {
        mesh.castShadow = true;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = list.map((m) => m.clone());
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
        cloned.forEach((m) => { matNames.push(m.name); if ((m as MeshStandardMaterial).isMeshStandardMaterial) mats.set(m.name, m as MeshStandardMaterial); });
      }
    });
    return {
      scene: root,
      clips: gltf.animations,
      bones: boneMap,
      materials: mats,
      report: validateModel(boneNames, gltf.animations.map((a) => a.name), matNames),
    };
  }, [gltf]);

  const useClips = report.missingClips.length === 0;
  const usable = useClips || report.missingBones.length === 0;

  useEffect(() => {
    if (!usable) { console.warn('Character GLB does not match the rig contract; using fallback.', report); onInvalid(); }
    else if (report.missingBones.length || report.missingClips.length || report.missingMaterials.length) console.warn('Character GLB is missing contract items', report);
  }, [usable, report, onInvalid]);

  useEffect(() => {
    const colors = skinMaterialColors(skin);
    materials.forEach((m, name) => {
      if (colors[name]) m.color.set(colors[name]);
      // Distinct PBR responses help cloth, skin, hair and boots read as separate
      // surfaces. Keep authored normal/roughness maps and skin recolouring intact.
      const roughness: Record<string, number> = {
        [MATERIAL_NAMES.shirt]: 0.91,
        [MATERIAL_NAMES.shirtTrim]: 0.76,
        [MATERIAL_NAMES.shorts]: 0.89,
        [MATERIAL_NAMES.socks]: 0.94,
        [MATERIAL_NAMES.boots]: 0.38,
        [MATERIAL_NAMES.bootsSole]: 0.82,
        [MATERIAL_NAMES.skin]: 0.69,
        [MATERIAL_NAMES.hair]: 0.78,
      };
      // Preserve authored roughness when a replacement GLB supplies a map.
      if (!m.roughnessMap && roughness[name] !== undefined) m.roughness = roughness[name];
      m.metalness = 0;
      // The original universal glow washed out shadows and made every surface
      // look similar. Keep material emissive properties from the authored GLB.
      m.needsUpdate = true;
    });
  }, [skin, materials]);

  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const actions = useMemo(() => {
    const map = new Map<AnimationState, AnimationAction>();
    for (const state of ANIMATION_STATES) {
      const clip = clips.find((c) => c.name === state);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.setLoop(LOOPING_STATES.has(state) ? LoopRepeat : LoopOnce, Infinity);
      a.clampWhenFinished = true;
      map.set(state, a);
    }
    return map;
  }, [clips, mixer]);

  const pose = useMemo(() => createPose(), []);
  const motion = useMemo(() => createPlayerMotion(), []);
  const motionRig = useMemo(() => createMotionRig({ root: scene, spine: bones.spine, head: bones.head,
    armLeft: bones.armLeft, armRight: bones.armRight, footLeft: bones.footLeft, footRight: bones.footRight }), [scene, bones]);
  const rest = useMemo(() => {
    const m = new Map<BoneKey, { x: number; y: number; z: number }>();
    (Object.keys(bones) as BoneKey[]).forEach((k) => { const b = bones[k]!; m.set(k, { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z }); });
    return m;
  }, [bones]);
  const footPos = useMemo(() => new Vector3(), []);
  const current = useMemo(() => ({ state: null as AnimationState | null, token: -1 }), []);

  useEffect(() => () => {
    motionRig.restore();
    mixer.stopAllAction();
    // React StrictMode replays effects on mount. Reset the state cache too,
    // otherwise the next frame thinks the stopped action is still playing.
    current.state = null;
    current.token = -1;
  }, [mixer, current, motionRig]);

  useFrame((_, dt) => {
    motionRig.restore();
    if (useClips) {
      const next = selectAnimationState(engine);
      if (next.state !== current.state || next.token !== current.token) {
        const to = actions.get(next.state);
        const from = current.state ? actions.get(current.state) : undefined;
        if (to) {
          to.reset().play();
          if (from && from !== to) from.crossFadeTo(to, next.state.startsWith('Kick') ? 0.04 : 0.15, false);
        }
        current.state = next.state;
        current.token = next.token;
      }
      // Sample every clip from simulation time, keeping paused frames and different render rates consistent.
      const act = current.state ? actions.get(current.state) : undefined;
      if (act) { act.paused = true; act.time = animationSampleTime(engine, next.state, act.getClip().duration); }
      mixer.update(dt);
      if (expressive) motionRig.apply(computePlayerMotion(engine, motion));
      if (inspector.active) {
        const foot = bones[current.state === 'KickLeft' ? 'footLeft' : 'footRight'];
        if (foot) { scene.updateMatrixWorld(true); foot.getWorldPosition(footPos); inspector.foot = [footPos.x, footPos.y, footPos.z]; }
      }
      if (import.meta.env.DEV && inspector.trace) {
        scene.updateMatrixWorld(true);
        const joints: number[] = [];
        for (const k of ['head', 'armLeft', 'armRight', 'footLeft', 'footRight', 'root'] as BoneKey[]) {
          const b = bones[k]; if (b) { b.getWorldPosition(footPos); joints.push(footPos.x, footPos.y, footPos.z); }
        }
        inspector.trace.push({ state: current.state ?? '', clip: next.clipTime ?? null, t: engine.time, joints });
      }
      return;
    }
    // Fallback for rigs without clips: apply the procedural pose on top of the rest pose.
    computePose(engine, pose);
    const set = (k: BoneKey, x: number, y: number, z: number) => {
      const b = bones[k]; const r = rest.get(k);
      if (b && r) b.rotation.set(r.x + x, r.y + y, r.z + z);
    };
    set('spine', pose.torsoPitch, 0, pose.torsoRoll);
    set('head', pose.headPitch, pose.headYaw, 0);
    set('armLeft', pose.armLeftPitch, 0, pose.armLeft);
    set('armRight', pose.armRightPitch, 0, -pose.armRight);
    set('thighLeft', pose.legs.left.thigh, 0, pose.legs.left.abduct);
    set('thighRight', pose.legs.right.thigh, 0, pose.legs.right.abduct);
    set('shinLeft', pose.legs.left.knee, 0, 0);
    set('shinRight', pose.legs.right.knee, 0, 0);
    set('footLeft', pose.legs.left.foot, 0, 0);
    set('footRight', pose.legs.right.foot, 0, 0);
    if (expressive) motionRig.apply(computePlayerMotion(engine, motion), false);
  });

  return <primitive object={scene} />;
}

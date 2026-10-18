import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, LoopOnce, Vector3, LoopRepeat, Material, MeshStandardMaterial, Quaternion, type AnimationAction, type Bone, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';
import { computePose, createPose } from './pose';
import { inspector } from './inspector';
import {
  ANIMATION_STATES, BONE_NAMES, MATERIAL_NAMES, CHARACTER_MODEL_URL, LOOPING_STATES, resolveBoneName, selectAnimationState, skinMaterialColors, validateModel,
  type AnimationState, type BoneKey,
} from './rig';

interface Props { engine: GameEngine; skin: Skin; onInvalid: () => void }

/**
 * Rigged GLB footballer (see docs/CHARACTER_GLB.md). Plays the named clips when present, otherwise drives the
 * contract bones from the shared procedural pose. Accepts Mixamo-style names or Freddie/UE aliases (with L/R swap).
 * Reports an invalid model so the primitive fallback is used.
 */
export function GlbCharacter({ engine, skin, onInvalid }: Props) {
  const gltf = useGLTF(CHARACTER_MODEL_URL);
  const { scene, clips, report, bones, materials } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as Object3D;
    const boneMap: Partial<Record<BoneKey, Bone>> = {};
    const mats = new Map<string, MeshStandardMaterial>();
    const boneNames: string[] = [];
    const matNames: string[] = [];
    const byName = new Map<string, Bone>();
    root.traverse((o) => {
      if ((o as Bone).isBone) {
        boneNames.push(o.name);
        byName.set(o.name, o as Bone);
      }
      const mesh = o as { isMesh?: boolean; material?: Material | Material[]; castShadow?: boolean; receiveShadow?: boolean };
      if (mesh.isMesh && mesh.material) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = list.map((m) => m.clone());
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
        cloned.forEach((m) => { matNames.push(m.name); if ((m as MeshStandardMaterial).isMeshStandardMaterial) mats.set(m.name, m as MeshStandardMaterial); });
      }
    });
    const present = new Set(boneNames);
    (Object.keys(BONE_NAMES) as BoneKey[]).forEach((k) => {
      const name = resolveBoneName(k, present);
      if (name) {
        const bone = byName.get(name);
        if (bone) boneMap[k] = bone;
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
      // Eyes stay authored; textured Skin/Hair only multiply the map (best-effort tint).
      if (name === 'Eyes') return;
      if (colors[name]) m.color.set(colors[name]);
      // Matte cloth / skin, slightly glossy boots; a faint self-glow keeps shaded sides from going muddy.
      const boots = name === MATERIAL_NAMES.boots || name === MATERIAL_NAMES.bootsSole;
      const texturedBody = name === MATERIAL_NAMES.skin || name === MATERIAL_NAMES.hair;
      m.roughness = boots ? 0.45 : texturedBody ? (name === MATERIAL_NAMES.hair ? 0.88 : 0.82) : 0.72;
      m.metalness = 0;
      m.emissive.copy(m.color).multiplyScalar(texturedBody ? 0.04 : 0.12);
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
  // Rest local quaternion plus parent-relative axes that match Mixamo (X right, Y along bone, Z forward).
  // Procedural deltas are authored in that space; UE bones need the axes remapped.
  const rest = useMemo(() => {
    const m = new Map<BoneKey, { q: Quaternion; axes: [Vector3, Vector3, Vector3] }>();
    const basis = (dir: 'up' | 'down'): [Vector3, Vector3, Vector3] => (
      dir === 'up'
        ? [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
        : [new Vector3(1, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, -1)]
    );
    const axisDir: Record<BoneKey, 'up' | 'down'> = {
      root: 'up', spine: 'up', head: 'up',
      armLeft: 'down', armRight: 'down',
      thighLeft: 'down', thighRight: 'down',
      shinLeft: 'down', shinRight: 'down',
      footLeft: 'down', footRight: 'down',
    };
    (Object.keys(bones) as BoneKey[]).forEach((k) => {
      const b = bones[k]!;
      const parent = b.parent;
      const parentQ = parent ? parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
      const invParent = parentQ.clone().invert();
      const [wx, wy, wz] = basis(axisDir[k]);
      m.set(k, {
        q: b.quaternion.clone(),
        axes: [wx.applyQuaternion(invParent), wy.applyQuaternion(invParent), wz.applyQuaternion(invParent)],
      });
    });
    return m;
  }, [bones]);
  const footPos = useMemo(() => new Vector3(), []);
  const current = useMemo(() => ({ state: null as AnimationState | null, token: -1 }), []);

  useEffect(() => () => {
    mixer.stopAllAction();
    // React StrictMode replays effects on mount. Reset the state cache too,
    // otherwise the next frame thinks the stopped action is still playing.
    current.state = null;
    current.token = -1;
  }, [mixer, current]);

  useFrame((_, dt) => {
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
      // Kick clips are positioned explicitly from engine state (physics stays authoritative; no free-running timer).
      const act = current.state ? actions.get(current.state) : undefined;
      if (act && next.clipTime !== undefined) { act.paused = true; act.time = next.clipTime; }
      mixer.update(dt);
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
    // Deltas are Mixamo-style (X right, Y along the bone, Z forward) expressed in the bone's parent frame.
    computePose(engine, pose);
    const delta = new Quaternion();
    const qx = new Quaternion();
    const qy = new Quaternion();
    const qz = new Quaternion();
    const set = (k: BoneKey, x: number, y: number, z: number) => {
      const b = bones[k]; const r = rest.get(k);
      if (!b || !r) return;
      qx.setFromAxisAngle(r.axes[0], x);
      qy.setFromAxisAngle(r.axes[1], y);
      qz.setFromAxisAngle(r.axes[2], z);
      delta.copy(qz).multiply(qy).multiply(qx);
      b.quaternion.copy(r.q).premultiply(delta);
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
    if (inspector.active) {
      const side = engine.contact?.side
        ?? (engine.lastKick.left >= engine.lastKick.right ? 'left' : 'right');
      const foot = bones[side === 'left' ? 'footLeft' : 'footRight'];
      if (foot) { scene.updateMatrixWorld(true); foot.getWorldPosition(footPos); inspector.foot = [footPos.x, footPos.y, footPos.z]; }
    }
  });

  return <primitive object={scene} />;
}

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, BoxGeometry, LoopOnce, LoopRepeat, Material, Mesh, MeshStandardMaterial, PointLight, Quaternion, Vector3, type AnimationAction, type Bone, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';
import { loadSettings, type Quality } from '../game/storage';
import { computePose, createPose } from './pose';
import { inspector } from './inspector';
import { computePlayerMotion, createPlayerMotion } from './motion';
import { createMotionRig } from './motionRig';
import {
  ANIMATION_STATES, BONE_NAMES, EXTRA_BONE_NAMES, MATERIAL_NAMES, CHARACTER_MODEL_URL, LOOPING_STATES, UE_BONE_NAMES, rigKind, selectAnimationState, animationSampleTime, skinMaterialColors, validateModel,
  type AnimationState, type BoneKey,
} from './rig';
import { ueDeltaQuaternion } from './ue-pose';
import { ueMovementQuaternion } from './ue-motion';

type KitPart = 'shirt' | 'trim' | 'shorts' | 'socks' | 'boots' | 'sole';

/** Instap straps in foot-bone space. Local +Y runs toward the toe and local −Z is the instep. */
const LACES: ReadonlyArray<{ position: [number, number, number]; size: [number, number, number] }> = [
  { position: [0, 0.042, -0.05], size: [0.07, 0.008, 0.012] },
  { position: [0, 0.068, -0.055], size: [0.066, 0.008, 0.012] },
  { position: [0, 0.094, -0.056], size: [0.06, 0.008, 0.012] },
  { position: [0, 0.12, -0.05], size: [0.052, 0.008, 0.011] },
  { position: [0, 0.082, -0.06], size: [0.013, 0.1, 0.01] },
];

const KIT_GLSL = `
float kitHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float kitWeave(vec2 uv) {
  vec2 g = uv * 16.0;
  vec2 f = abs(fract(g) - 0.5);
  float thread = smoothstep(0.48, 0.2, min(f.x, f.y));
  float n = kitHash(floor(g));
  float wear = smoothstep(0.62, 0.95, kitHash(floor(uv * 3.2)));
  return thread * mix(0.7, 1.0, n) * mix(0.58, 1.0, 1.0 - wear);
}
float kitTri(vec3 p, vec3 n) {
  vec3 w = abs(normalize(n));
  w /= max(w.x + w.y + w.z, 0.0001);
  return kitWeave(p.yz) * w.x + kitWeave(p.xz) * w.y + kitWeave(p.xy) * w.z;
}
float kitStitch(vec2 uv) {
  vec2 g = uv * vec2(14.0, 8.0);
  float dash = step(0.38, fract(g.x + floor(g.y) * 0.35));
  float row = smoothstep(0.2, 0.04, abs(fract(g.y) - 0.5));
  return dash * row;
}
float kitStitchTri(vec3 p, vec3 n) {
  vec3 w = abs(normalize(n));
  w /= max(w.x + w.y + w.z, 0.0001);
  return kitStitch(p.yz) * w.x + kitStitch(p.xz) * w.y + kitStitch(p.xy) * w.z;
}
`;

const KIT_ALBEDO = `
{
  vec3 kitN = normalize(vKitN);
  #ifdef KIT_SHIRT
    diffuseColor.rgb *= mix(vec3(0.74, 0.7, 0.64), vec3(1.0), clamp(kitTri(vKitPos, kitN), 0.0, 1.0));
  #elif defined(KIT_SHORTS)
    diffuseColor.rgb *= mix(vec3(0.7, 0.68, 0.64), vec3(1.0), clamp(kitTri(vKitPos * 0.85, kitN), 0.0, 1.0));
  #elif defined(KIT_SOCKS)
    diffuseColor.rgb *= 0.84 + 0.16 * sin(vKitPos.y * 150.0);
  #elif defined(KIT_TRIM)
    float stitch = kitStitchTri(vKitPos, kitN);
    float luma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 thread = luma > 0.45 ? vec3(0.16, 0.13, 0.1) : vec3(0.95, 0.92, 0.86);
    diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.92, 0.9, 0.84), thread, stitch);
  #elif defined(KIT_BOOTS)
    float grain = kitHash(floor(vKitPos.xy * 42.0));
    float pore = smoothstep(0.72, 1.0, kitHash(vKitPos.zy * 28.0));
    diffuseColor.rgb *= mix(0.84, 1.05, grain);
    diffuseColor.rgb *= 1.0 - pore * 0.14;
  #elif defined(KIT_SOLE)
    float groove = smoothstep(0.18, 0.0, abs(fract(vKitPos.z * 18.0) - 0.5));
    diffuseColor.rgb *= mix(1.0, 0.7, groove);
  #endif
}
`;

const KIT_ROUGH = `
#ifdef KIT_BOOTS
  roughnessFactor = clamp(roughnessFactor + (kitHash(vKitPos.xz * 30.0) - 0.5) * 0.22, 0.2, 0.85);
#elif defined(KIT_SHIRT) || defined(KIT_SHORTS) || defined(KIT_SOCKS) || defined(KIT_TRIM)
  roughnessFactor = clamp(roughnessFactor + (kitTri(vKitPos, normalize(vKitN)) - 0.6) * 0.18, 0.32, 1.0);
#endif
`;

function kitPart(name: string): KitPart | null {
  switch (name) {
    case MATERIAL_NAMES.shirt: return 'shirt';
    case MATERIAL_NAMES.shirtTrim: return 'trim';
    case MATERIAL_NAMES.shorts: return 'shorts';
    case MATERIAL_NAMES.socks: return 'socks';
    case MATERIAL_NAMES.boots: return 'boots';
    case MATERIAL_NAMES.bootsSole: return 'sole';
    default: return null;
  }
}

function kitDefine(part: KitPart): string {
  switch (part) {
    case 'shirt': return 'KIT_SHIRT';
    case 'trim': return 'KIT_TRIM';
    case 'shorts': return 'KIT_SHORTS';
    case 'socks': return 'KIT_SOCKS';
    case 'boots': return 'KIT_BOOTS';
    case 'sole': return 'KIT_SOLE';
    default: {
      const exhaustive: never = part;
      return exhaustive;
    }
  }
}

function rimStrength(quality: Quality): number {
  switch (quality) {
    case 'low': return 0;
    case 'medium': return 0.14;
    case 'high': return 0.26;
    default: {
      const exhaustive: never = quality;
      return exhaustive;
    }
  }
}

/** Weave, stitches and leather grain multiply the existing colour. They never replace it. */
function bindKitShader(m: MeshStandardMaterial, part: KitPart, quality: Quality) {
  const define = kitDefine(part);
  const rim = rimStrength(quality);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKitPos;\nvarying vec3 vKitN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvKitN = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKitPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#define ${define}\n#include <common>\nvarying vec3 vKitPos;\nvarying vec3 vKitN;\n${KIT_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${KIT_ALBEDO}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${KIT_ROUGH}`)
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\nfloat kitFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\noutgoingLight += vec3(1.0, 0.78, 0.55) * pow(1.0 - kitFacing, 2.4) * ${rim.toFixed(3)};`,
      );
  };
  m.customProgramCacheKey = () => `kickole-kit-${define}-${rim}`;
  m.needsUpdate = true;
}

function finishKit(m: MeshStandardMaterial, part: KitPart, quality: Quality) {
  m.flatShading = false;
  const rich = quality !== 'low';
  switch (part) {
    case 'shirt':
      m.roughness = 0.76;
      m.metalness = 0;
      m.envMapIntensity = rich ? 0.75 : 0.5;
      m.emissive.copy(m.color).multiplyScalar(rich ? 0.035 : 0.1);
      break;
    case 'shorts':
      m.roughness = 0.84;
      m.metalness = 0;
      m.envMapIntensity = rich ? 0.7 : 0.45;
      m.emissive.copy(m.color).multiplyScalar(rich ? 0.03 : 0.08);
      break;
    case 'socks':
      m.roughness = 0.68;
      m.metalness = 0;
      m.envMapIntensity = rich ? 0.65 : 0.45;
      m.emissive.copy(m.color).multiplyScalar(rich ? 0.03 : 0.08);
      break;
    case 'trim':
      m.roughness = 0.55;
      m.metalness = 0;
      m.envMapIntensity = rich ? 0.7 : 0.5;
      m.emissive.copy(m.color).multiplyScalar(rich ? 0.03 : 0.08);
      break;
    case 'boots':
      m.roughness = rich ? 0.42 : 0.38;
      m.metalness = 0.08;
      m.envMapIntensity = rich ? 1.15 : 0.7;
      m.emissive.set('#000000');
      break;
    case 'sole':
      m.roughness = 0.86;
      m.metalness = 0;
      m.envMapIntensity = 0.35;
      m.emissive.set('#000000');
      break;
    default: {
      const exhaustive: never = part;
      return exhaustive;
    }
  }
  if (rich) bindKitShader(m, part, quality);
}

interface Props { engine: GameEngine; skin: Skin; onInvalid: () => void; expressive?: boolean }

/**
 * Rigged GLB footballer (see docs/CHARACTER_GLB.md). Plays the named clips when present, otherwise drives the
 * contract bones from the shared procedural pose. Reports an invalid model so the primitive fallback is used.
 */
export function GlbCharacter({ engine, skin, onInvalid, expressive = true }: Props) {
  const gltf = useGLTF(CHARACTER_MODEL_URL);
  const { scene, clips, report, bones, materials, kind } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as Object3D;
    const boneMap: Partial<Record<BoneKey, Bone>> = {};
    const byName = new Map<string, Bone>();
    const mats = new Map<string, MeshStandardMaterial>();
    const boneNames: string[] = [];
    const matNames: string[] = [];
    root.traverse((o) => {
      if ((o as Bone).isBone) {
        boneNames.push(o.name);
        byName.set(o.name, o as Bone);
      }
      const mesh = o as { isMesh?: boolean; material?: Material | Material[]; castShadow?: boolean; receiveShadow?: boolean; frustumCulled?: boolean };
      if (mesh.isMesh && mesh.material) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = list.map((m) => m.clone());
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
        cloned.forEach((m) => { matNames.push(m.name); if ((m as MeshStandardMaterial).isMeshStandardMaterial) mats.set(m.name, m as MeshStandardMaterial); });
      }
    });
    const resolved = rigKind(boneNames);
    const names: Partial<Record<BoneKey, string>> = resolved === 'ue'
      ? UE_BONE_NAMES
      : { ...BONE_NAMES, ...EXTRA_BONE_NAMES };
    (Object.keys(names) as BoneKey[]).forEach((k) => {
      const boneName = names[k];
      if (!boneName) return;
      const bone = byName.get(boneName);
      if (bone) boneMap[k] = bone;
    });
    return {
      scene: root,
      clips: gltf.animations,
      bones: boneMap,
      materials: mats,
      kind: resolved,
      report: validateModel(boneNames, gltf.animations.map((a) => a.name), matNames),
    };
  }, [gltf]);

  const useClips = report.missingClips.length === 0;
  const usable = useClips || report.missingBones.length === 0;

  useEffect(() => {
    if (!usable) { console.warn('Character GLB does not match the rig contract; using fallback.', report); onInvalid(); return; }
    if (report.missingBones.length || report.missingMaterials.length) console.warn('Character GLB is missing contract items', report);
    // The Quaternius player ships without clips and is posed procedurally. Only the contract rig is expected to include them.
    else if (kind === 'contract' && report.missingClips.length) console.warn('Character GLB is missing animation clips', report.missingClips);
  }, [usable, report, onInvalid, kind]);

  useEffect(() => {
    const colors = skinMaterialColors(skin);
    const quality = loadSettings().quality;
    materials.forEach((m, name) => {
      // Skin and Hair on the Quaternius model already carry colour textures. Multiplying a skin tint
      // on top of those maps muddies the face, so only flat kit materials take the skin colours.
      const textured = !!m.map && (name === MATERIAL_NAMES.skin || name === MATERIAL_NAMES.hair);
      // The bundled boot map is a flat black image, so a colour multiply stays black. Drop it and use the shop leather.
      if (name === MATERIAL_NAMES.boots || name === MATERIAL_NAMES.bootsSole) m.map = null;
      if (!textured && colors[name]) m.color.set(colors[name]);
      const part = kitPart(name);
      if (part) {
        // Colour stays whatever was just written, including a later boot-shop tint of Boots.
        finishKit(m, part, quality);
        return;
      }
      const skinMat = name === MATERIAL_NAMES.skin;
      const hair = name === MATERIAL_NAMES.hair;
      m.flatShading = false;
      m.roughness = hair ? 0.9 : skinMat ? 0.55 : 0.68;
      m.metalness = 0;
      m.envMapIntensity = skinMat ? 0.85 : 0.65;
      if (m.map) m.emissive.set('#000000');
      else m.emissive.copy(m.color).multiplyScalar(0.08);
    });
  }, [skin, materials]);

  useEffect(() => {
    const quality = loadSettings().quality;
    if (quality === 'low') return;
    const geos = LACES.map((spec) => new BoxGeometry(spec.size[0], spec.size[1], spec.size[2]));
    const laceMat = new MeshStandardMaterial({ name: 'Boot_Laces', color: '#2a211c', roughness: 0.46, metalness: 0.03 });
    const added: Mesh[] = [];
    const attach = (bone: Bone | undefined) => {
      if (!bone) return;
      LACES.forEach((spec, i) => {
        const mesh = new Mesh(geos[i], laceMat);
        mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
        mesh.castShadow = quality === 'high';
        mesh.frustumCulled = false;
        bone.add(mesh);
        added.push(mesh);
      });
    };
    attach(bones.footLeft);
    attach(bones.footRight);
    const key = new PointLight('#ffd7ae', quality === 'high' ? 1.65 : 0.95, 2.7, 2);
    key.position.set(0.42, 1.66, 1.08);
    scene.add(key);
    const rim = quality === 'high' ? new PointLight('#fff3d6', 1.15, 2.4, 2) : null;
    if (rim) {
      rim.position.set(-0.48, 1.48, -0.92);
      scene.add(rim);
    }
    return () => {
      for (const mesh of added) mesh.parent?.remove(mesh);
      laceMat.dispose();
      for (const geo of geos) geo.dispose();
      scene.remove(key);
      key.dispose();
      if (rim) { scene.remove(rim); rim.dispose(); }
    };
  }, [scene, bones]);

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
  const restQuat = useMemo(() => {
    const m = new Map<BoneKey, Quaternion>();
    (Object.keys(bones) as BoneKey[]).forEach((k) => { const b = bones[k]; if (b) m.set(k, b.quaternion.clone()); });
    return m;
  }, [bones]);
  const deltaQ = useMemo(() => new Quaternion(), []);
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
          if (from && from !== to) {
            // Snappy into kicks (physics-timed); softer out of kick/miss/celebrate into Idle.
            const fromKick = current.state?.startsWith('Kick');
            const toKick = next.state.startsWith('Kick');
            const fade = toKick ? 0.04 : fromKick || current.state === 'Miss' || current.state === 'Celebrate' ? 0.22 : 0.15;
            from.crossFadeTo(to, fade, false);
          }
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
    if (kind === 'ue') {
      computePose(engine, pose);
      const allowMotion = expressive && !pose.lockMotion;
      if (allowMotion) computePlayerMotion(engine, motion);
      else { motion.rootX = 0; motion.rootY = 0; }
      scene.position.x = allowMotion ? motion.rootX : 0;
      scene.position.y = pose.bodyY + (allowMotion ? motion.rootY : 0);
      (Object.keys(UE_BONE_NAMES) as BoneKey[]).forEach((k) => {
        const b = bones[k];
        const restQ = restQuat.get(k);
        if (b && restQ) b.quaternion.copy(restQ).multiply(allowMotion
          ? ueMovementQuaternion(k, pose, motion, deltaQ) : ueDeltaQuaternion(k, pose, deltaQ));
      });
      if (inspector.active) {
        const kickLeft = engine.lastKick.left >= engine.lastKick.right;
        const foot = bones[kickLeft ? 'footLeft' : 'footRight'];
        if (foot) { scene.updateMatrixWorld(true); foot.getWorldPosition(footPos); inspector.foot = [footPos.x, footPos.y, footPos.z]; }
      }
      if (import.meta.env.DEV && inspector.trace) {
        scene.updateMatrixWorld(true);
        const joints: number[] = [];
        for (const k of ['head', 'armLeft', 'armRight', 'footLeft', 'footRight', 'root'] as BoneKey[]) {
          const b = bones[k]; if (b) { b.getWorldPosition(footPos); joints.push(footPos.x, footPos.y, footPos.z); }
        }
        const selected = selectAnimationState(engine);
        inspector.trace.push({ state: selected.state, clip: selected.clipTime ?? null, t: engine.time, joints });
      }
      return;
    }
    // Fallback for rigs without clips: apply the procedural pose on top of the rest pose.
    computePose(engine, pose);
    const set = (k: BoneKey, x: number, y: number, z: number) => {
      const b = bones[k]; const r = rest.get(k);
      if (b && r) b.rotation.set(r.x + x, r.y + y, r.z + z);
    };
    set('spine', pose.torsoPitch, pose.torsoYaw, pose.torsoRoll);
    set('neck', pose.neckPitch, pose.neckYaw, 0);
    set('head', pose.headPitch, pose.headYaw, 0);
    set('armLeft', pose.armLeftPitch, 0, pose.armLeft);
    set('armRight', pose.armRightPitch, 0, -pose.armRight);
    set('elbowLeft', pose.elbowLeft, 0, 0);
    set('elbowRight', pose.elbowRight, 0, 0);
    set('thighLeft', pose.legs.left.thigh, pose.legs.left.twist, pose.legs.left.abduct);
    set('thighRight', pose.legs.right.thigh, pose.legs.right.twist, pose.legs.right.abduct);
    set('shinLeft', pose.legs.left.knee, 0, 0);
    set('shinRight', pose.legs.right.knee, 0, 0);
    set('footLeft', pose.legs.left.foot, pose.legs.left.ankleYaw, pose.legs.left.ankleRoll);
    set('footRight', pose.legs.right.foot, pose.legs.right.ankleYaw, pose.legs.right.ankleRoll);
    if (expressive && !pose.lockMotion) motionRig.apply(computePlayerMotion(engine, motion), false);
  });

  return <primitive object={scene} />;
}

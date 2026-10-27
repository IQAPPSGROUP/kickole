import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, BoxGeometry, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, Quaternion, Vector3, type AnimationAction, type Bone, type Object3D, type WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { DRACO_DECODER_PATH, KTX2_TRANSCODER_PATH } from './decoders';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameEngine } from '../engine/engine';
import { alignFootWindow, clearFootContactAnchors, setFootContactAnchors, type BallCenter } from '../engine/footContact';
import { cowboyBootSpecs, outfitSpecs } from '../game/outfitFit';
import { isMeshOutfit, OUTFIT_COVER, outfitModelUrl } from '../game/outfitMesh';
import { isOutfitId } from '../game/outfits';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { applyContractBones } from './contractPose';
import { createFreestyleRig } from './freestyleLayer';
import { computePose, createPose } from './pose';
import { inspector } from './inspector';
import { computePlayerMotion, createPlayerMotion } from './motion';
import { createMotionRig } from './motionRig';
import { characterLod } from './qualityTier';
import {
  ANIMATION_STATES, BONE_NAMES, EXTRA_BONE_NAMES, MATERIAL_NAMES, characterModelUrl, LOOPING_STATES, UE_BONE_NAMES, rigKind, selectAnimationState, animationSampleTime, validateModel,
  type AnimationState, type BoneKey,
} from './rig';
import { ueDeltaQuaternion } from './ue-pose';
import { ueMovementQuaternion } from './ue-motion';
import { kickToeClearance, toeClearanceQuaternion } from './kickClearance';
import { mountOutfitSpecs } from './outfitAttach';
import { MountedOutfit } from './outfitSkin';
import { measureHeadSpan, meshIsPhotographedFace } from './bodyColour';
import { clearKitClothShader } from './kitShirtShader';
import { paintKitClothColours, paintPreviewColours } from './playerPaint';
import { bindSunsetToon, toToonMaterial } from './toon';

function ballCenter(v: Vector3): BallCenter {
  return { x: v.x, y: v.y, z: v.z };
}

/** Snap the live ball onto the posed laces and keep the juggle window there. */
function publishKickContact(engine: GameEngine, freestyle: ReturnType<typeof createFreestyleRig>) {
  const left = ballCenter(freestyle.anchors.left.ball);
  const right = ballCenter(freestyle.anchors.right.ball);
  setFootContactAnchors(left, right);
  alignFootWindow(engine.config, left, right);
  return { left, right };
}

function liftKickToe(
  bones: Partial<Record<BoneKey, Bone>>,
  state: AnimationState | null,
  clipTime: number,
  out: Quaternion,
) {
  if (state !== 'KickLeft' && state !== 'KickRight') return;
  const pitch = kickToeClearance(clipTime);
  if (pitch === 0) return;
  const foot = bones[state === 'KickLeft' ? 'footLeft' : 'footRight'];
  if (!foot) return;
  foot.quaternion.multiply(toeClearanceQuaternion(pitch, out));
}

/** Straps in foot-bone space. On this rig local +Y runs toward the toe and local −Z is the instep. */
const LACES: ReadonlyArray<{ position: [number, number, number]; size: [number, number, number] }> = [
  { position: [0, 0.042, -0.055], size: [0.074, 0.012, 0.016] },
  { position: [0, 0.07, -0.06], size: [0.068, 0.012, 0.016] },
  { position: [0, 0.098, -0.06], size: [0.06, 0.012, 0.015] },
  { position: [0, 0.124, -0.052], size: [0.05, 0.012, 0.014] },
  { position: [0, 0.084, -0.068], size: [0.016, 0.11, 0.014] },
];

/** Local +Y runs toward the toe and local +Z is the sole (opposite the instep). */
const SOLE: { position: [number, number, number]; size: [number, number, number] } = {
  position: [0, 0.07, 0.042],
  size: [0.074, 0.16, 0.018],
};
const STUDS: ReadonlyArray<[number, number, number]> = [
  [-0.022, 0.018, 0.056],
  [0.022, 0.018, 0.056],
  [-0.022, 0.07, 0.056],
  [0.022, 0.07, 0.056],
  [-0.022, 0.122, 0.054],
  [0.022, 0.122, 0.054],
];

const ktxRenderer: { gl: WebGLRenderer | null } = { gl: null };

function extendCharacterLoader(loader: { setKTX2Loader: (ktx2: KTX2Loader) => void }) {
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(KTX2_TRANSCODER_PATH);
  if (ktxRenderer.gl) ktx2.detectSupport(ktxRenderer.gl);
  loader.setKTX2Loader(ktx2);
}

interface Props { engine: GameEngine; skin: Skin; onInvalid: () => void; expressive?: boolean; quality?: Quality }

/**
 * Rigged GLB footballer (see docs/CHARACTER_GLB.md). Plays the named clips when present, otherwise drives the
 * contract bones from the shared procedural pose. Reports an invalid model so the primitive fallback is used.
 */
export function GlbCharacter({ engine, skin, onInvalid, expressive = true, quality = 'high' }: Props) {
  const gl = useThree((state) => state.gl);
  ktxRenderer.gl = gl;
  // drei types GLTFLoader from three-stdlib, which does not match three's KTX2Loader.
  const gltf = useGLTF(characterModelUrl(characterLod(quality), skin.playerBody), DRACO_DECODER_PATH, true, extendCharacterLoader as never);
  const { scene, clips, report, bones, materials, kind, quaternius, pbr } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as Object3D;
    const boneMap: Partial<Record<BoneKey, Bone>> = {};
    const byName = new Map<string, Bone>();
    const mats: Array<MeshToonMaterial | MeshStandardMaterial | MeshBasicMaterial> = [];
    const boneNames: string[] = [];
    const matNames: string[] = [];
    let textured = false;
    root.traverse((o) => {
      if ((o as Bone).isBone) {
        boneNames.push(o.name);
        byName.set(o.name, o as Bone);
      }
        const mesh = o as Mesh;
      if (mesh.isMesh && mesh.material) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = list.map((m) => {
          const source = m as MeshStandardMaterial;
          // Keep the purchased PBR material: its own albedo, normal and roughness.
          // A missing normal is the only case that still falls back to the toon shader.
          const keepPbr = Boolean(source.normalMap) || source.isMeshStandardMaterial;
          if (source.normalMap || source.map) textured = true;
          const next = keepPbr ? source.clone() : toToonMaterial(m, m.name === MATERIAL_NAMES.skin);
          next.name = m.name;
          // The head photograph stays at the file's own colour. A swatch multiply
          // turns the eyes into rings and the mouth into mud. The female head is
          // a separate Skin mesh weighted to the Head bone, with no file flag.
          if (next.name === MATERIAL_NAMES.skin && (source.userData.headPhoto || meshIsPhotographedFace(mesh))) {
            next.userData.headPhoto = true;
            next.userData.facePhoto = true;
            const span = measureHeadSpan(mesh);
            next.userData.headMin = span.min;
            next.userData.headSpan = span.span;
          }
          return next;
        });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
        cloned.forEach((m) => { matNames.push(m.name); mats.push(m); });
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
      quaternius: boneNames.includes('Clavicle_L'),
      pbr: textured,
      report: validateModel(boneNames, gltf.animations.map((a) => a.name), matNames),
    };
  }, [gltf]);

  const useClips = report.missingClips.length === 0;
  const usable = useClips || report.missingBones.length === 0;
  const freestyle = useMemo(() => createFreestyleRig(), []);

  useLayoutEffect(() => {
    if (!useClips) {
      clearFootContactAnchors();
      return;
    }
    freestyle.measure(scene, clips);
    const anchors = publishKickContact(engine, freestyle);
    if (import.meta.env.DEV) {
      (window as unknown as { __footContact?: typeof anchors }).__footContact = anchors;
    }
    return () => clearFootContactAnchors();
  }, [scene, clips, useClips, freestyle, engine]);

  useEffect(() => {
    if (!usable) { console.warn('Character GLB does not match the rig contract; using fallback.', report); onInvalid(); return; }
    if (report.missingBones.length || report.missingMaterials.length) console.warn('Character GLB is missing contract items', report);
    // The Quaternius player ships without clips and is posed procedurally. Only the contract rig is expected to include them.
    else if (kind === 'contract' && report.missingClips.length) console.warn('Character GLB is missing animation clips', report.missingClips);
  }, [usable, report, onInvalid, kind]);

  useEffect(() => {
    paintPreviewColours(materials, skin);
  }, [skin, materials]);

  useEffect(() => {
    const painted = paintKitClothColours(materials, skin);
    const meshed = isMeshOutfit(skin.outfitId);
    const specs = [
      ...(!meshed && skin.outfitId && isOutfitId(skin.outfitId) ? outfitSpecs(skin.outfitId, skin.playerBody) : []),
      ...(!meshed && skin.bootStyle === 'cowboy' ? cowboyBootSpecs(skin.playerBody) : []),
    ];
    const release = specs.length > 0 ? mountOutfitSpecs(scene, specs) : null;
    return () => {
      release?.();
      for (const material of materials) {
        const standard = material as MeshStandardMaterial;
        if (!standard.isMeshStandardMaterial || standard.userData.baseMap === undefined) continue;
        standard.map = standard.userData.baseMap;
        if (typeof standard.userData.baseRough === 'number') standard.roughness = standard.userData.baseRough;
        if (typeof standard.userData.baseMetal === 'number') standard.metalness = standard.userData.baseMetal;
        if (material.name === MATERIAL_NAMES.shirt
          || material.name === MATERIAL_NAMES.shirtTrim
          || material.name === MATERIAL_NAMES.socks) clearKitClothShader(standard);
      }
      painted?.dispose();
    };
  }, [skin, materials, scene]);

  useEffect(() => {
    if (pbr || quality === 'low' || isMeshOutfit(skin.outfitId)) return;
    const laceGeos = LACES.map((spec) => new BoxGeometry(spec.size[0], spec.size[1], spec.size[2]));
    const heelGeo = new BoxGeometry(0.078, 0.05, 0.018);
    const soleGeo = new BoxGeometry(SOLE.size[0], SOLE.size[1], SOLE.size[2]);
    const studGeo = new BoxGeometry(0.012, 0.012, 0.014);
    const laceMat = new MeshToonMaterial({ name: 'Boot_Laces', color: skin.boots.lace ?? '#F8F9FB' });
    const trimMat = new MeshToonMaterial({ name: 'Boot_Trim', color: skin.boots.trim ?? skin.boots.main });
    const soleMat = new MeshToonMaterial({ name: 'Boot_Sole', color: skin.boots.sole });
    const studMat = new MeshToonMaterial({ name: 'Boot_Studs', color: '#C4C8D0' });
    bindSunsetToon(laceMat, 'flat', skin.clothing.shirtTrim);
    bindSunsetToon(trimMat, 'flat', skin.clothing.shirtTrim);
    bindSunsetToon(soleMat, 'flat', skin.clothing.shirtTrim);
    bindSunsetToon(studMat, 'flat', skin.clothing.shirtTrim);
    const added: Mesh[] = [];
    const attach = (bone: Bone | undefined) => {
      if (!bone) return;
      LACES.forEach((spec, i) => {
        const mesh = new Mesh(laceGeos[i], laceMat);
        mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
        mesh.castShadow = quality === 'high';
        mesh.frustumCulled = false;
        bone.add(mesh);
        added.push(mesh);
      });
      const heel = new Mesh(heelGeo, trimMat);
      heel.position.set(0, 0.02, -0.05);
      heel.frustumCulled = false;
      bone.add(heel);
      added.push(heel);
      const sole = new Mesh(soleGeo, soleMat);
      sole.position.set(SOLE.position[0], SOLE.position[1], SOLE.position[2]);
      sole.frustumCulled = false;
      bone.add(sole);
      added.push(sole);
      for (const stud of STUDS) {
        const mesh = new Mesh(studGeo, studMat);
        mesh.position.set(stud[0], stud[1], stud[2]);
        mesh.frustumCulled = false;
        bone.add(mesh);
        added.push(mesh);
      }
    };
    attach(bones.footLeft);
    attach(bones.footRight);
    freestyle.measure(scene, clips);
    const anchors = publishKickContact(engine, freestyle);
    if (import.meta.env.DEV) {
      (window as unknown as { __footContact?: typeof anchors }).__footContact = anchors;
    }
    return () => {
      for (const mesh of added) mesh.parent?.remove(mesh);
      laceMat.dispose();
      trimMat.dispose();
      soleMat.dispose();
      studMat.dispose();
      for (const geo of laceGeos) geo.dispose();
      heelGeo.dispose();
      soleGeo.dispose();
      studGeo.dispose();
    };
  }, [scene, clips, bones, skin.boots.lace, skin.boots.trim, skin.boots.main, skin.clothing.shirtTrim, skin.outfitId, pbr, quality, freestyle, engine]);

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
  const hipsRestY = useMemo(() => bones.root?.position.y ?? 0, [bones]);
  const deltaQ = useMemo(() => new Quaternion(), []);
  const footPos = useMemo(() => new Vector3(), []);
  const current = useMemo(() => ({ state: null as AnimationState | null, token: -1 }), []);
  const idleSettled = useRef(false);
  const kitPoseKey = `${skin.clothing.shirt}|${skin.clothing.shorts}|${skin.clothing.socks}|${skin.kitPaint?.pattern ?? ''}|${skin.kitPaint?.main ?? ''}`;

  useEffect(() => {
    // A kit swap keeps the same skeleton. Settle Idle again so a leftover kick blend
    // cannot stay on the body when the shirt changes or the menu returns.
    idleSettled.current = false;
  }, [kitPoseKey]);

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
            // The torso eases across the fade. Contact itself is the foot IK path, not this blend.
            const fromKick = current.state?.startsWith('Kick');
            const toKick = next.state.startsWith('Kick');
            // Long enough that the torso eases. The striking foot is IK'd on its own path, so this fade does not delay contact.
            const fade = toKick ? 0.12 : fromKick || current.state === 'Miss' || current.state === 'Celebrate' ? 0.22 : 0.16;
            from.crossFadeTo(to, fade, false);
          }
        }
        current.state = next.state;
        current.token = next.token;
      }
      // Sample every clip from simulation time, keeping paused frames and different render rates consistent.
      const act = current.state ? actions.get(current.state) : undefined;
      if (act) { act.paused = true; act.time = animationSampleTime(engine, next.state, act.getClip().duration); }
      const atMenu = engine.phase === 'menu' || engine.phase === 'ready';
      if (atMenu) {
        // A crossfade started mid-kick keeps the crouched clip alive. Drop it
        // so the menu samples Idle at full weight instead of a bent blend.
        for (const [name, action] of actions) {
          if (name !== 'Idle') action.stop();
        }
        const idle = actions.get('Idle');
        if (idle && (!idle.isRunning() || idle.getEffectiveWeight() < 0.999)) {
          idle.enabled = true;
          idle.reset().setEffectiveWeight(1).play();
          idle.paused = true;
          idle.time = animationSampleTime(engine, 'Idle', idle.getClip().duration);
        }
        if (!idleSettled.current) freestyle.reset();
        idleSettled.current = true;
      } else {
        idleSettled.current = false;
      }
      // Quaternius bones keep UE local axes. Tricks that are not one of the five clips
      // (around the world, header, neck stall, thigh, high flick) reuse the procedural pose
      // so the head — and the skinned hair — still follow the ball.
      if (quaternius) {
        computePose(engine, pose);
        const dancing = engine.celebration != null || engine.trick?.kind === 'groove';
        const trickPose = pose.lockMotion || engine.trick != null || dancing;
        if (trickPose) {
          scene.position.set(0, pose.bodyY, 0);
          if (bones.root) bones.root.position.y = hipsRestY;
          (Object.keys(bones) as BoneKey[]).forEach((k) => {
            const b = bones[k];
            const restQ = restQuat.get(k);
            if (b && restQ) b.quaternion.copy(restQ).multiply(ueDeltaQuaternion(k, pose, deltaQ));
          });
        } else {
          mixer.update(dt);
          scene.position.set(0, 0, 0);
          if (act && (next.state === 'KickLeft' || next.state === 'KickRight')) {
            const kickSide = next.state === 'KickLeft' ? 'left' : 'right';
            const legKeys = kickSide === 'left'
              ? (['thighLeft', 'shinLeft', 'footLeft'] as const)
              : (['thighRight', 'shinRight', 'footRight'] as const);
            for (const key of legKeys) {
              const bone = bones[key];
              const restQ = restQuat.get(key);
              if (bone && restQ) bone.quaternion.copy(restQ).multiply(ueDeltaQuaternion(key, pose, deltaQ));
            }
          }
          if (next.state === 'Idle' || next.state.startsWith('Kick')) {
            for (const key of ['head', 'neck'] as const) {
              const b = bones[key];
              const restQ = restQuat.get(key);
              if (b && restQ) b.quaternion.copy(restQ).multiply(ueDeltaQuaternion(key, pose, deltaQ));
            }
          }
        }
      } else {
        computePose(engine, pose);
        const dancing = engine.celebration != null || engine.trick?.kind === 'groove';
        const trickPose = pose.lockMotion || engine.trick != null || dancing;
        if (trickPose) {
          applyContractBones(bones, pose, hipsRestY);
          scene.position.set(0, 0, 0);
        } else {
          mixer.update(dt);
          if (act) liftKickToe(bones, next.state, act.time, deltaQ);
          if (expressive) motionRig.apply(computePlayerMotion(engine, motion));
        }
      }
      freestyle.apply(engine, next.state, pose, dt);
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

  return (
    <>
      <primitive object={scene} />
      {isMeshOutfit(skin.outfitId) && (
        <MountedOutfit url={outfitModelUrl(skin.outfitId, skin.playerBody)} host={scene} cover={OUTFIT_COVER[skin.outfitId]} />
      )}
    </>
  );
}

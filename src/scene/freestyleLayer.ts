import {
  AnimationMixer,
  Euler,
  Quaternion,
  Vector3,
  type AnimationClip,
  type Object3D,
} from 'three';
import type { Side } from '../engine/config';
import type { GameEngine } from '../engine/engine';
import type { TrickKind } from '../engine/tricks';
import { atwFootOffset } from './atwOrbit';
import { aimPoint, pinAnkle, solveTwoBone, forwardPole } from './footIk';
import { kickToeClearance, toeClearanceQuaternion } from './kickClearance';
import {
  BOOT_MATERIALS,
  THIGH_MATERIALS,
  UPPER_MATERIALS,
  closestSkinnedVertex,
  instepLocalPoint,
  surfaceGap,
} from './measureFootContact';
import type { Pose } from './pose';
import type { AnimationState } from './rig';
import { KICK_CLIP_CONTACT_TIME } from './rig';
import { createSecondaryMotion } from './secondaryMotion';

const CONTACT_DELAY = 0.04;
const FOLLOW_TIME = 0.18;
const RECOVER_TIME = 0.42;

export interface LegChain {
  thigh: Object3D;
  shin: Object3D;
  foot: Object3D;
  toe?: Object3D;
}

export interface FreestyleBones {
  hips: Object3D;
  spine: Object3D;
  chest?: Object3D;
  neck?: Object3D;
  head?: Object3D;
  armLeft?: Object3D;
  armRight?: Object3D;
  elbowLeft?: Object3D;
  elbowRight?: Object3D;
  left: LegChain;
  right: LegChain;
}

interface LegAnchor {
  plant: Vector3;
  contact: Vector3;
  follow: Vector3;
  /** Ball centre the authored contact pose was built against. */
  ball: Vector3;
}

const easeIn = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x;
};

const smooth = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/**
 * Ankle position for one touch.
 * Starts on the planted foot (no snap), accelerates into the ball, follows through, then recovers.
 */
export function strikeAnkle(
  since: number,
  start: Vector3,
  contact: Vector3,
  follow: Vector3,
  plant: Vector3,
  out: Vector3,
): Vector3 {
  if (since <= 0) return out.copy(start);
  if (since < CONTACT_DELAY) {
    const u = since / CONTACT_DELAY;
    // Hold, then accelerate. The foot is still moving as it meets the ball.
    return out.copy(start).lerp(contact, easeIn(u));
  }
  if (since < FOLLOW_TIME) {
    const u = (since - CONTACT_DELAY) / (FOLLOW_TIME - CONTACT_DELAY);
    return out.copy(contact).lerp(follow, Math.sin(u * Math.PI * 0.5));
  }
  if (since < RECOVER_TIME) {
    const u = (since - FOLLOW_TIME) / (RECOVER_TIME - FOLLOW_TIME);
    return out.copy(follow).lerp(plant, smooth(u));
  }
  return out.copy(plant);
}

/** How loaded the body is while the ball is dropping, before the foot is chosen. */
export function approachWeight(eta: number, falling: boolean): number {
  if (!falling || !Number.isFinite(eta) || eta < 0 || eta > 0.45) return 0;
  return smooth(1 - eta / 0.45);
}

function clipNamed(clips: AnimationClip[], name: string): AnimationClip | null {
  return clips.find((clip) => clip.name === name) ?? null;
}

function poseClip(scene: Object3D, clip: AnimationClip, time: number): AnimationMixer {
  const mixer = new AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.play();
  action.paused = true;
  action.time = 0;
  mixer.update(0);
  action.time = time;
  mixer.update(0);
  scene.updateMatrixWorld(true);
  return mixer;
}

function bone(scene: Object3D, name: string): Object3D | undefined {
  let found: Object3D | undefined;
  scene.traverse((obj) => {
    if (!found && obj.name === name) found = obj;
  });
  return found;
}

function chain(scene: Object3D, side: Side): LegChain | null {
  const suffix = side === 'left' ? 'L' : 'R';
  const thigh = bone(scene, `UpperLeg_${suffix}`);
  const shin = bone(scene, `LowerLeg_${suffix}`);
  const foot = bone(scene, `Foot_${suffix}`);
  if (!thigh || !shin || !foot) return null;
  return { thigh, shin, foot, toe: bone(scene, `Toe_${suffix}`) };
}

const footWorld = new Vector3();
const NAPE = new Vector3(0, 0.06, -0.1);
const hipRest = new Vector3();
const segB = new Vector3();
const ball = new Vector3();
const hipDelta = new Vector3();
const kneeWorld = new Vector3();
const pole = new Vector3();
const hipWorld = new Vector3();
const euler = new Euler();
const swing = new Quaternion();
const headPosed = new Quaternion();
const clipThigh = new Quaternion();
const clipShin = new Quaternion();
const clipFoot = new Quaternion();
const solvedThigh = new Quaternion();
const solvedShin = new Quaternion();
const solvedFoot = new Quaternion();
const orientQ = new Quaternion();
const localScratch = new Vector3();
const restScratch = new Vector3();
const approach = new Vector3();
const surface = new Vector3();
const ankleTarget = new Vector3();
const strikeDir = new Vector3();
const landmark = new Vector3();
const instepLocal: Record<Side, Vector3> = {
  left: new Vector3(0, -0.02, 0.12),
  right: new Vector3(0, -0.02, 0.12),
};
const thighLocal: Record<Side, Vector3> = {
  left: new Vector3(0, -0.2, 0.06),
  right: new Vector3(0, -0.2, 0.06),
};
const backLocal = new Vector3(0, 0.08, -0.1);
const foreheadLocal = new Vector3(0, 0.1, 0.09);
const plantLiftL = new Vector3();
const plantLiftR = new Vector3();

function other(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

function kickingSide(engine: GameEngine, state: AnimationState | null): Side | null {
  if (state === 'KickLeft') return 'left';
  if (state === 'KickRight') return 'right';
  const trickSide = engine.trick?.side;
  if (trickSide) return trickSide;
  if (engine.contact?.side) return engine.contact.side;
  if (engine.lastKick.left < 0 && engine.lastKick.right < 0) return null;
  return engine.lastKick.left >= engine.lastKick.right ? 'left' : 'right';
}

/**
 * Runtime motion on the Fab clips.
 * Clips still supply idle, kick, miss and celebrate. This layer plants the
 * standing foot, puts the striking surface on the ball, and adds balance,
 * anticipation and secondary motion the clips do not carry.
 */
export function createFreestyleRig() {
  const anchors: Record<Side, LegAnchor> = {
    left: { plant: new Vector3(), contact: new Vector3(), follow: new Vector3(), ball: new Vector3() },
    right: { plant: new Vector3(), contact: new Vector3(), follow: new Vector3(), ball: new Vector3() },
  };
  let bones: FreestyleBones | null = null;
  let skinned: Object3D | null = null;
  let ready = false;
  const secondary = createSecondaryMotion();
  const shown = new Map<string, Quaternion>();
  const exact = new Set<string>();
  const chestRest = new Quaternion();
  const headLag = new Quaternion();
  let headLagReady = false;

  function leg(side: Side): LegChain {
    if (!bones) throw new Error('freestyle rig is not measured');
    return side === 'left' ? bones.left : bones.right;
  }

  function capture(scene: Object3D, clips: AnimationClip[], side: Side, clipName: string, time: number, slot: 'contact' | 'follow') {
    const clip = clipNamed(clips, clipName);
    const limb = leg(side);
    if (!clip) return;
    const mixer = poseClip(scene, clip, time);
    if (slot === 'contact') {
      const pitch = kickToeClearance(time);
      if (pitch !== 0) limb.foot.quaternion.multiply(toeClearanceQuaternion(pitch, swing));
      scene.updateMatrixWorld(true);
    }
    limb.foot.getWorldPosition(anchors[side][slot]);
    if (slot === 'contact') {
      const local = instepLocalPoint(scene, limb.foot, limb.toe);
      if (local) instepLocal[side].copy(local);
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
  }

  function pin(side: Side, at: Vector3) {
    const limb = leg(side);
    pinAnkle(limb.thigh, limb.shin, limb.foot, limb.toe, at);
  }

  function ease(node: Object3D | undefined, dt: number, tau: number) {
    if (!node || exact.has(node.uuid)) return;
    const key = node.uuid;
    const prev = shown.get(key);
    if (!prev) {
      shown.set(key, node.quaternion.clone());
      return;
    }
    const k = 1 - Math.exp(-Math.min(dt, 1 / 20) / tau);
    prev.slerp(node.quaternion, k);
    node.quaternion.copy(prev);
  }

  function remember(node: Object3D | undefined) {
    if (!node) return;
    const prev = shown.get(node.uuid);
    if (prev) prev.copy(node.quaternion);
    else shown.set(node.uuid, node.quaternion.clone());
  }

  /** This bone was aimed at the ball. Keep that pose; do not ease it back off the contact. */
  function hold(node: Object3D | undefined) {
    if (!node) return;
    exact.add(node.uuid);
    remember(node);
  }

  function ballNow(engine: GameEngine, out: Vector3): Vector3 {
    return out.set(engine.ball.x, engine.ball.y, engine.ball.z);
  }

  /** Move the hips in world space. The support foot is pinned again by the caller. */
  function shiftHips(worldDelta: Vector3) {
    if (!bones) return;
    const parent = bones.hips.parent;
    bones.hips.updateWorldMatrix(true, false);
    bones.hips.getWorldPosition(hipDelta);
    hipDelta.add(worldDelta);
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(hipDelta);
    }
    bones.hips.position.copy(hipDelta);
    bones.hips.updateMatrix();
    bones.hips.updateWorldMatrix(true, true);
  }

  /** Point the instep local offset along `worldDir` without moving the ankle. */
  function orientInstep(side: Side, worldDir: Vector3) {
    const limb = leg(side);
    const local = instepLocal[side];
    limb.shin.updateWorldMatrix(true, false);
    limb.shin.getWorldQuaternion(orientQ);
    localScratch.copy(worldDir).applyQuaternion(orientQ.invert());
    if (local.lengthSq() < 1e-8 || localScratch.lengthSq() < 1e-8) return;
    restScratch.copy(local).normalize();
    limb.foot.quaternion.setFromUnitVectors(restScratch, localScratch.normalize());
    limb.foot.updateMatrix();
    limb.foot.updateWorldMatrix(true, true);
  }

  function legReach(side: Side): number {
    const limb = leg(side);
    return limb.shin.position.length() + limb.foot.position.length() - 0.02;
  }

  /** True when every planted ankle is still inside its leg length after `delta`. */
  function withinReach(delta: Vector3, planted: readonly Side[]): boolean {
    if (!bones) return false;
    bones.hips.getWorldPosition(hipWorld);
    const x = hipWorld.x + delta.x;
    const y = hipWorld.y + delta.y;
    const z = hipWorld.z + delta.z;
    for (const side of planted) {
      const plant = anchors[side].plant;
      const dist = Math.hypot(x - plant.x, y - plant.y, z - plant.z);
      if (dist > legReach(side)) return false;
    }
    return true;
  }

  function shiftClamped(delta: Vector3, planted: readonly Side[]): number {
    let scale = 1;
    for (let i = 0; i < 8; i++) {
      restScratch.copy(delta).multiplyScalar(scale);
      if (withinReach(restScratch, planted)) {
        shiftHips(restScratch);
        return scale;
      }
      scale *= 0.5;
    }
    return 0;
  }

  /** Drop the hips so a straight support leg can step without leaving the plant. */
  function crouch(planted: readonly Side[], amount = 0.045, floor = 0.62) {
    if (!bones || amount <= 0) return;
    bones.hips.getWorldPosition(hipWorld);
    const drop = Math.min(amount, Math.max(0, hipWorld.y - floor));
    if (drop < 0.004) return;
    kneeWorld.set(0, -drop, 0);
    if (withinReach(kneeWorld, planted)) shiftHips(kneeWorld);
  }

  /**
   * Move the hips until `ankle` is inside the striking leg, while planted feet stay down.
   * A straight Fab leg has almost no spare reach, so the hips drop before they step.
   */
  function ensureAnkleReach(side: Side, ankle: Vector3, planted: readonly Side[]) {
    const maxStrike = legReach(side) + 0.015;
    for (let pass = 0; pass < 8; pass++) {
      const limb = leg(side);
      limb.thigh.getWorldPosition(hipWorld);
      const strikeDist = hipWorld.distanceTo(ankle);
      let supportOk = true;
      for (const plantedSide of planted) {
        if (hipWorld.distanceTo(anchors[plantedSide].plant) > legReach(plantedSide)) supportOk = false;
      }
      if (strikeDist <= maxStrike && supportOk) return;
      if (!supportOk) crouch(planted, 0.05);
      if (strikeDist > maxStrike) {
        limb.thigh.getWorldPosition(hipWorld);
        const excess = strikeDist - maxStrike + 0.03;
        localScratch.copy(ankle).sub(hipWorld).multiplyScalar(excess / Math.max(strikeDist, 1e-4));
        // Prefer a crouch over lifting the hips, which locks the support leg.
        if (localScratch.y > 0) localScratch.y *= 0.25;
        crouch(planted, 0.03);
        shiftClamped(localScratch, planted);
      }
    }
  }

  function solveStrike(side: Side, ankle: Vector3, towardBall: Vector3, wideKnee = false) {
    const limb = leg(side);
    limb.thigh.getWorldPosition(hipWorld);
    if (wideKnee) {
      const outward = side === 'left' ? -1 : 1;
      pole.set(hipWorld.x + outward * 0.55, hipWorld.y + 0.05, hipWorld.z + 0.5);
    } else {
      forwardPole(hipWorld, pole);
    }
    solveTwoBone(limb.thigh, limb.shin, limb.foot, ankle, pole);
    orientInstep(side, towardBall);
  }

  /**
   * Put the instep on the ball surface. `fromBall` is the direction from the ball
   * toward the foot (the player side for a kick, downward for a flick).
   * The correction uses the skinned boot, in world space, so a clip ankle cannot pass the test.
   */
  function seatFoot(side: Side, ballCenter: Vector3, radius: number, fromBall: Vector3) {
    const limb = leg(side);
    const len = Math.max(0.05, instepLocal[side].length());
    approach.copy(fromBall);
    if (approach.lengthSq() < 1e-8) approach.set(0, -0.2, -1);
    approach.normalize();
    surface.copy(ballCenter).addScaledVector(approach, radius);
    ankleTarget.copy(surface).addScaledVector(approach, len);
    strikeDir.copy(approach).negate();
    solveStrike(side, ankleTarget, strikeDir);
    if (!skinned) return;
    for (let pass = 0; pass < 6; pass++) {
      limb.foot.getWorldPosition(footWorld);
      const gap = surfaceGap(skinned, ballCenter, radius, BOOT_MATERIALS, footWorld, 0.45);
      if (!Number.isFinite(gap) || Math.abs(gap) < 0.01) break;
      // Positive gap: the leather is still short of the ball. Step the ankle toward it.
      const step = Math.max(-0.06, Math.min(0.1, gap));
      ankleTarget.addScaledVector(approach, -step);
      strikeDir.copy(approach).negate();
      solveStrike(side, ankleTarget, strikeDir);
    }
  }

  /**
   * Aim `landmark`, then walk the hips until a skinned vertex on that landmark
   * sits on the ball. Support feet stay inside leg reach.
   */
  function bringSurface(
    ballCenter: Vector3,
    radius: number,
    materials: Set<string>,
    nearPoint: Vector3,
    near: number,
    planted: readonly Side[],
    aim: () => void,
  ): number {
    let gap = Number.POSITIVE_INFINITY;
    if (!skinned || !bones) {
      aim();
      return gap;
    }
    const nudge = (rotate: boolean): number => {
      if (rotate) aim();
      if (!skinned || !bones) return Number.POSITIVE_INFINITY;
      bones.hips.updateWorldMatrix(true, true);
      const hit = closestSkinnedVertex(skinned, ballCenter, materials, nearPoint, near);
      if (!hit) return Number.POSITIVE_INFINITY;
      const next = hit.distanceTo(ballCenter) - radius;
      if (Math.abs(next) < 0.01) return next;
      approach.copy(ballCenter).sub(hit);
      if (approach.lengthSq() < 1e-8) return next;
      approach.normalize();
      localScratch.copy(approach).multiplyScalar(Math.max(-0.05, Math.min(0.06, next)));
      if (!withinReach(localScratch, planted)) crouch(planted, 0.03);
      if (shiftClamped(localScratch, planted) > 0) nearPoint.add(restScratch);
      return next;
    };
    for (let pass = 0; pass < 6; pass++) {
      gap = nudge(true);
      if (Math.abs(gap) < 0.01) return gap;
    }
    for (let pass = 0; pass < 4; pass++) {
      gap = nudge(false);
      if (Math.abs(gap) < 0.01) return gap;
    }
    return gap;
  }

  /** Tricks start from the idle hips. A previous contact must not keep walking the body. */
  function resetHipPlanar() {
    if (!bones) return;
    bones.hips.position.x = hipRest.x;
    bones.hips.position.z = hipRest.z;
    bones.hips.updateMatrix();
    bones.hips.updateWorldMatrix(true, true);
  }

  function segmentDistance(point: Vector3, a: Vector3, b: Vector3): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const lenSq = abx * abx + aby * aby + abz * abz;
    if (lenSq < 1e-8) return point.distanceTo(a);
    const t = Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby + (point.z - a.z) * abz) / lenSq));
    segB.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
    return point.distanceTo(segB);
  }

  /** Push the circling foot back outside the standing leg. Returns the closest approach in metres. */
  function separateFromSupport(side: Side, support: Side): number {
    const limb = leg(side);
    const stood = leg(support);
    const outward = side === 'left' ? -1 : 1;
    let closest = Number.POSITIVE_INFINITY;
    for (let pass = 0; pass < 4; pass++) {
      limb.shin.getWorldPosition(kneeWorld);
      limb.foot.getWorldPosition(footWorld);
      const toe = limb.toe;
      if (toe) toe.getWorldPosition(surface);
      else surface.copy(footWorld);
      stood.thigh.getWorldPosition(hipWorld);
      stood.shin.getWorldPosition(pole);
      stood.foot.getWorldPosition(strikeDir);
      closest = Math.min(
        segmentDistance(kneeWorld, hipWorld, pole),
        segmentDistance(footWorld, hipWorld, pole),
        segmentDistance(footWorld, pole, strikeDir),
        segmentDistance(surface, hipWorld, pole),
        segmentDistance(surface, pole, strikeDir),
      );
      if (closest >= 0.06) break;
      ankleTarget.copy(footWorld);
      ankleTarget.x += outward * 0.05;
      ankleTarget.z += 0.04;
      ankleTarget.y += 0.03;
      limb.thigh.getWorldPosition(hipWorld);
      pole.set(hipWorld.x + outward * 0.6, hipWorld.y + 0.2, hipWorld.z + 0.4);
      solveTwoBone(limb.thigh, limb.shin, limb.foot, ankleTarget, pole);
      strikeDir.copy(ball).sub(ankleTarget);
      if (strikeDir.lengthSq() > 1e-8) orientInstep(side, strikeDir);
    }
    return closest;
  }

  function applyIdle(engine: GameEngine, pose: Pose) {
    if (!bones) return;
    const t = engine.time;
    const amp = engine.reducedMotion ? 0.35 : 1;
    const shift = Math.sin(t * 1.35);
    const breath = Math.sin(t * 2.15);
    const balance = Math.sin(t * 0.7 + 0.4);
    const falling = engine.phase === 'playing' && engine.ball.vy < 0;
    const load = approachWeight(engine.timeToContact(), falling) * amp;
    bones.hips.position.x += shift * 0.016 * amp;
    bones.hips.position.y += (-0.01 + breath * 0.007) * amp - load * 0.012;
    bones.hips.updateMatrix();
    bones.hips.updateWorldMatrix(true, true);
    bones.spine.quaternion.multiply(swing.setFromEuler(euler.set(
      pose.torsoPitch * 0.15 + breath * 0.02 * amp + load * 0.06,
      shift * 0.03 * amp,
      -shift * 0.045 * amp + balance * 0.012 * amp,
    )));
    const arm = 0.06 * amp + load * 0.12;
    bones.armLeft?.quaternion.multiply(swing.setFromEuler(euler.set(0.04 * shift, 0, -arm)));
    bones.armRight?.quaternion.multiply(swing.setFromEuler(euler.set(-0.04 * shift, 0, arm)));
    pin('left', anchors.left.plant);
    pin('right', anchors.right.plant);
  }

  function applyStrike(engine: GameEngine, side: Side, since: number) {
    const limb = leg(side);
    const held = engine.contact?.side === side;
    const weight = held
      ? 1
      : since <= 0
        ? 0
        : since < CONTACT_DELAY
          ? smooth(since / CONTACT_DELAY)
          : since < FOLLOW_TIME
            ? 1 - smooth((since - CONTACT_DELAY) / (FOLLOW_TIME - CONTACT_DELAY))
            : 0;
    if (weight > 0.001) {
      clipThigh.copy(limb.thigh.quaternion);
      clipShin.copy(limb.shin.quaternion);
      clipFoot.copy(limb.foot.quaternion);
      ballNow(engine, ball);
      limb.thigh.getWorldPosition(hipWorld);
      approach.copy(hipWorld).sub(ball);
      seatFoot(side, ball, engine.config.ballRadius, approach);
      // Full contact stays on the leather. Earlier frames keep some of the clip so the swing does not pop.
      if (weight < 0.999) {
        solvedThigh.copy(limb.thigh.quaternion);
        solvedShin.copy(limb.shin.quaternion);
        solvedFoot.copy(limb.foot.quaternion);
        limb.thigh.quaternion.copy(clipThigh).slerp(solvedThigh, weight);
        limb.shin.quaternion.copy(clipShin).slerp(solvedShin, weight);
        limb.foot.quaternion.copy(clipFoot).slerp(solvedFoot, weight);
        limb.thigh.updateMatrix();
        limb.shin.updateMatrix();
        limb.foot.updateMatrix();
        limb.shin.updateWorldMatrix(true, true);
      }
    }
    pin(other(side), anchors[other(side)].plant);
    const env = since < CONTACT_DELAY ? easeIn(since / CONTACT_DELAY) : since < RECOVER_TIME ? 1 - smooth((since - FOLLOW_TIME) / (RECOVER_TIME - FOLLOW_TIME)) : 0;
    const counter = Math.min(1, Math.max(0, env));
    if (bones?.armLeft && bones.armRight) {
      const leftLead = side === 'right' ? 1 : -0.4;
      const rightLead = side === 'left' ? 1 : -0.4;
      bones.armLeft.quaternion.multiply(swing.setFromEuler(euler.set(0.22 * leftLead * counter, 0, 0.18 * counter)));
      bones.armRight.quaternion.multiply(swing.setFromEuler(euler.set(0.22 * rightLead * counter, 0, -0.18 * counter)));
    }
  }

  function refreshThigh(side: Side) {
    const limb = leg(side);
    limb.thigh.updateWorldMatrix(true, true);
    limb.thigh.localToWorld(landmark.copy(thighLocal[side]));
  }

  /** Step and crouch until `worldPoint` is `distance` from the hips and the plants still reach. */
  function placeHipNear(worldPoint: Vector3, distance: number, planted: readonly Side[]) {
    if (!bones) return;
    for (let pass = 0; pass < 6; pass++) {
      bones.hips.getWorldPosition(hipWorld);
      approach.copy(worldPoint).sub(hipWorld);
      const dist = approach.length();
      const excess = dist - distance;
      if (Math.abs(excess) < 0.012 || dist < 1e-4) return;
      approach.multiplyScalar(excess / dist);
      if (!withinReach(approach, planted)) crouch(planted, 0.04, 0.8);
      let scale = shiftClamped(approach, planted);
      if (scale < 0.25) scale = shiftClamped(approach.multiplyScalar(0.5), planted);
      if (scale < 0.05) return;
    }
  }

  function applyThigh(engine: GameEngine, side: Side) {
    const limb = leg(side);
    const planted: Side[] = [other(side)];
    resetHipPlanar();
    clipThigh.copy(limb.thigh.quaternion);
    ballNow(engine, ball);
    const radius = engine.config.ballRadius;
    surface.copy(ball);
    surface.y -= radius * 0.9;
    const midLen = Math.min(0.28, Math.max(0.16, thighLocal[side].length()));
    placeHipNear(surface, midLen, planted);
    bringSurface(ball, radius, THIGH_MATERIALS, landmark, 0.28, planted, () => {
      limb.thigh.quaternion.copy(clipThigh);
      limb.thigh.updateMatrix();
      refreshThigh(side);
      surface.copy(ball);
      surface.y -= radius * 0.9;
      aimPoint(limb.thigh, thighLocal[side], surface, 2.2);
      refreshThigh(side);
    });
    pin(other(side), anchors[other(side)].plant);
  }

  function applyHead(engine: GameEngine) {
    const head = bones?.head;
    const spine = bones?.spine;
    if (!head || !bones) return;
    resetHipPlanar();
    // Heels are up before the contact solve so the body can rise into the ball.
    bones.hips.position.y += 0.03;
    bones.hips.updateMatrix();
    bones.hips.updateWorldMatrix(true, true);
    clipFoot.copy(head.quaternion);
    if (spine) clipThigh.copy(spine.quaternion);
    ballNow(engine, ball);
    const radius = engine.config.ballRadius;
    const planted: Side[] = ['left', 'right'];
    let lean = 0;
    bringSurface(ball, radius, UPPER_MATERIALS, landmark, 0.16, planted, () => {
      if (spine) {
        spine.quaternion.copy(clipThigh);
        if (lean > 0) spine.quaternion.multiply(swing.setFromEuler(euler.set(lean, 0, 0)));
        spine.updateMatrix();
      }
      head.quaternion.copy(clipFoot);
      head.updateMatrix();
      head.updateWorldMatrix(true, true);
      head.localToWorld(landmark.copy(foreheadLocal));
      aimPoint(head, foreheadLocal, ball, 1.35);
      head.updateWorldMatrix(true, true);
      head.localToWorld(landmark.copy(foreheadLocal));
      lean += 0.16;
    });
    // Tip the forehead back (~35°) after the leather is found, then slide the
    // body with it so the hairline stays on the ball. A tilt inside the aim
    // loop points the face away and the planted feet cannot close a 25 cm gap.
    head.updateWorldMatrix(true, true);
    head.localToWorld(surface.copy(foreheadLocal));
    head.quaternion.multiply(swing.setFromEuler(euler.set(-0.62, 0, 0)));
    head.updateMatrix();
    head.updateWorldMatrix(true, true);
    head.localToWorld(landmark.copy(foreheadLocal));
    approach.copy(surface).sub(landmark);
    crouch(planted, 0.04);
    shiftClamped(approach, planted);
    if (bones.armLeft && bones.armRight) {
      bones.armLeft.quaternion.multiply(swing.setFromEuler(euler.set(0.12, 0, -0.65)));
      bones.armRight.quaternion.multiply(swing.setFromEuler(euler.set(0.12, 0, 0.7)));
    }
    if (bones.elbowLeft && bones.elbowRight) {
      bones.elbowLeft.quaternion.multiply(swing.setFromEuler(euler.set(0.4, 0, 0)));
      bones.elbowRight.quaternion.multiply(swing.setFromEuler(euler.set(0.4, 0, 0)));
    }
    hold(head);
    hold(spine);
    hold(bones.chest);
    plantLiftL.copy(anchors.left.plant);
    plantLiftR.copy(anchors.right.plant);
    plantLiftL.y += 0.035;
    plantLiftR.y += 0.035;
    pin('left', plantLiftL);
    pin('right', plantLiftR);
  }

  function applyNeck(engine: GameEngine) {
    const shelf = bones?.chest ?? bones?.spine;
    if (!shelf) return;
    resetHipPlanar();
    clipThigh.copy(shelf.quaternion);
    if (bones?.neck) clipShin.copy(bones.neck.quaternion);
    if (bones?.head) clipFoot.copy(bones.head.quaternion);
    ballNow(engine, ball);
    const radius = engine.config.ballRadius;
    const planted: Side[] = ['left', 'right'];
    bringSurface(ball, radius, UPPER_MATERIALS, landmark, 0.36, planted, () => {
      shelf.quaternion.copy(clipThigh);
      shelf.updateMatrix();
      if (bones?.neck) {
        bones.neck.quaternion.copy(clipShin);
        bones.neck.updateMatrix();
      }
      shelf.updateWorldMatrix(true, true);
      // Search the whole upper back, not one vertex the hinge swung off the leather.
      shelf.getWorldPosition(landmark);
      landmark.y += 0.06;
      landmark.z -= 0.05;
      surface.copy(ball);
      surface.y -= radius * 0.35;
      aimPoint(shelf, backLocal, surface, 1.2);
      if (bones?.neck) aimPoint(bones.neck, NAPE, ball, 0.9);
      // Face stays in front of the stall so the ball reads on the upper back.
      if (bones?.head) {
        bones.head.quaternion.copy(clipFoot);
        bones.head.quaternion.multiply(swing.setFromEuler(euler.set(0.45, 0, 0)));
        bones.head.updateMatrix();
      }
      shelf.updateWorldMatrix(true, true);
      shelf.getWorldPosition(landmark);
      landmark.y += 0.06;
      landmark.z -= 0.05;
    });
    hold(bones?.spine);
    hold(bones?.neck);
    hold(bones?.head);
    hold(shelf);
    pin('left', anchors.left.plant);
    pin('right', anchors.right.plant);
  }

  /**
   * Outside around-the-world. The foot meets the ball on the pop and the catch,
   * and passes over the top in between. It does not stick to the leather for the whole orbit.
   */
  function applyAtw(engine: GameEngine, side: Side) {
    const support = other(side);
    const planted: Side[] = [support];
    resetHipPlanar();
    const rev = engine.trick?.phase === 'recover' ? 1 : (engine.trick?.revolution ?? 0);
    ballNow(engine, ball);
    const radius = engine.config.ballRadius;
    const len = Math.max(0.05, instepLocal[side].length());
    const outward = side === 'left' ? -1 : 1;
    const offset = atwFootOffset(rev, outward, radius);
    const orbit = Math.min(1, Math.max(0, (rev - 0.12) / 0.78));
    const hop = engine.trick?.phase === 'execute' ? Math.sin(orbit * Math.PI) * 0.06 : 0;
    if (offset.contact) {
      approach.set(offset.x, offset.y, offset.z);
      if (approach.lengthSq() < 1e-6) approach.set(0, -1, 0);
      seatFoot(side, ball, radius, approach);
    } else {
      approach.set(offset.x, offset.y, offset.z);
      if (approach.lengthSq() < 1e-8) approach.set(0, 1, 0);
      approach.normalize();
      surface.copy(ball).addScaledVector(approach, Math.hypot(offset.x, offset.y, offset.z));
      ankleTarget.copy(surface).addScaledVector(approach, len);
      ensureAnkleReach(side, ankleTarget, planted);
      strikeDir.copy(approach).negate();
      solveStrike(side, ankleTarget, strikeDir, true);
    }
    separateFromSupport(side, support);
    plantLiftL.copy(anchors[support].plant);
    plantLiftL.y += hop;
    pin(support, plantLiftL);
    const counter = Math.sin(Math.min(1, Math.max(0, rev)) * Math.PI);
    if (bones?.spine) {
      bones.spine.quaternion.multiply(swing.setFromEuler(euler.set(0.1, outward * 0.12 * counter, -outward * 0.1)));
    }
    if (bones?.armLeft && bones.armRight) {
      const same = side === 'left' ? -1 : 1;
      bones.armLeft.quaternion.multiply(swing.setFromEuler(euler.set(-0.15 * counter, 0, -0.55 + same * 0.35 * counter)));
      bones.armRight.quaternion.multiply(swing.setFromEuler(euler.set(-0.15 * counter, 0, 0.55 + same * 0.35 * counter)));
    }
    if (bones?.head) {
      bones.head.quaternion.multiply(swing.setFromEuler(euler.set(0.58, 0, 0)));
      hold(bones.head);
    }
  }

  /** High kick, samba on the spot, then a cushioned catch as the ball comes down. */
  function applyGroove(engine: GameEngine) {
    if (!bones) return;
    resetHipPlanar();
    const trick = engine.trick;
    const age = Math.max(0, engine.time - (trick?.startedAt ?? engine.time));
    const flight = engine.config.tricks.grooveFlightSec;
    const danceStart = 0.2;
    const danceEnd = danceStart + engine.config.tricks.grooveDanceSec;
    const reacquire = age >= flight - 0.4;
    const dancing = trick?.phase === 'execute' && age >= danceStart && age < danceEnd && !reacquire;
    if (dancing) {
      const beat = Math.sin((age - danceStart) * Math.PI * 6);
      bones.hips.position.x = hipRest.x + beat * 0.025;
      bones.hips.position.y += 0.01 * Math.abs(beat);
      bones.hips.updateMatrix();
      bones.hips.updateWorldMatrix(true, true);
      if (bones.spine) bones.spine.quaternion.multiply(swing.setFromEuler(euler.set(0, beat * 0.08, beat * 0.12)));
      if (bones.armLeft && bones.armRight) {
        bones.armLeft.quaternion.multiply(swing.setFromEuler(euler.set(0.05, 0, -0.48 - 0.22 * beat)));
        bones.armRight.quaternion.multiply(swing.setFromEuler(euler.set(0.05, 0, 0.48 + 0.22 * beat)));
      }
    } else if (trick?.phase === 'execute' && bones.head) {
      bones.head.quaternion.multiply(swing.setFromEuler(euler.set(age < danceStart ? -0.5 : -0.6, 0, 0)));
      hold(bones.head);
    }
    const catching = trick?.phase === 'recover';
    if (catching) {
      const side = trick.side ?? 'right';
      ballNow(engine, ball);
      approach.set(0, -1, -0.08);
      seatFoot(side, ball, engine.config.ballRadius, approach);
      pin(other(side), anchors[other(side)].plant);
      return;
    }
    pin('left', anchors.left.plant);
    pin('right', anchors.right.plant);
  }

  /**
   * High flick: the foot chambers under the ball, the instep meets the underside,
   * then the leg carries on upward. Not a second copy of the straight kick.
   */
  function applyFlick(engine: GameEngine, side: Side, since: number) {
    const limb = leg(side);
    const support = other(side);
    resetHipPlanar();
    pin(support, anchors[support].plant);
    ballNow(engine, ball);
    const radius = engine.config.ballRadius;
    const len = Math.max(0.05, instepLocal[side].length());
    const contact = since >= 0.03 && since <= 0.08;
    if (contact) {
      // Instep meets the underside, then the leg carries the ball upward.
      seatFoot(side, ball, radius, approach.set(0, -1, -0.12));
    } else if (since < 0.03) {
      const u = (since / 0.03) ** 2;
      footWorld.copy(anchors[side].plant);
      footWorld.y += 0.22;
      footWorld.z += 0.02;
      surface.copy(ball);
      surface.y -= radius + len;
      surface.z -= 0.04;
      ankleTarget.copy(footWorld).lerp(surface, u);
      limb.thigh.getWorldPosition(hipWorld);
      solveTwoBone(limb.thigh, limb.shin, limb.foot, ankleTarget, forwardPole(hipWorld, pole));
      strikeDir.set(0, 1, 0.15);
      orientInstep(side, strikeDir);
    } else {
      const rise = Math.min(1, (since - 0.08) / 0.16);
      const recover = since < 0.3 ? 0 : Math.min(1, (since - 0.3) / 0.2);
      // Follow-through climbs past the ball instead of repeating the straight kick.
      ankleTarget.set(ball.x, ball.y + 0.22 + 0.62 * rise, ball.z + 0.02 + 0.08 * rise);
      if (recover > 0) ankleTarget.lerp(anchors[side].plant, recover);
      limb.thigh.getWorldPosition(hipWorld);
      solveTwoBone(limb.thigh, limb.shin, limb.foot, ankleTarget, forwardPole(hipWorld, pole));
      strikeDir.set(0, 1, 0.2);
      orientInstep(side, strikeDir);
    }
    if (bones?.spine) {
      const lean = since < 0.22 ? since / 0.22 : Math.max(0, 1 - (since - 0.22) / 0.24);
      bones.spine.quaternion.multiply(swing.setFromEuler(euler.set(-0.42 * lean, 0, 0)));
      bones.spine.updateMatrix();
    }
    const counter = since < 0.32 ? Math.min(1, since / 0.08) : Math.max(0, 1 - (since - 0.32) / 0.18);
    if (bones?.armLeft && bones.armRight) {
      const leftLead = side === 'right' ? 1 : -0.25;
      const rightLead = side === 'left' ? 1 : -0.25;
      bones.armLeft.quaternion.multiply(swing.setFromEuler(euler.set(-0.55 * counter, 0, 0.15 * counter + 0.4 * leftLead * counter)));
      bones.armRight.quaternion.multiply(swing.setFromEuler(euler.set(-0.55 * counter, 0, -0.15 * counter + 0.4 * rightLead * counter)));
    }
    pin(support, anchors[support].plant);
  }

  function applyTrick(engine: GameEngine, kind: TrickKind) {
    const side = kickingSide(engine, null) ?? 'left';
    switch (kind) {
      case 'aroundTheWorld':
        applyAtw(engine, side);
        return;
      case 'thigh':
        applyThigh(engine, side);
        return;
      case 'header':
        applyHead(engine);
        return;
      case 'neckStall':
        applyNeck(engine);
        return;
      case 'highFlick':
        applyFlick(engine, side, Math.max(0, engine.time - engine.lastKick[side]));
        return;
      case 'groove':
        applyGroove(engine);
        return;
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  }

  function storeLocal(joint: Object3D, world: Vector3, out: Vector3) {
    joint.updateWorldMatrix(true, false);
    out.copy(world);
    joint.worldToLocal(out);
  }

  function captureBodyLandmarks() {
    if (!bones || !skinned) return;
    const skin = new Set(['Skin']);
    for (const side of ['left', 'right'] as const) {
      const limb = leg(side);
      limb.thigh.updateWorldMatrix(true, true);
      limb.thigh.getWorldPosition(hipWorld);
      limb.shin.getWorldPosition(footWorld);
      landmark.copy(hipWorld).lerp(footWorld, 0.58);
      landmark.y += 0.04;
      landmark.z += 0.05;
      landmark.x += side === 'left' ? -0.02 : 0.02;
      const hit = closestSkinnedVertex(skinned, landmark, THIGH_MATERIALS, landmark, 0.12);
      if (hit) storeLocal(limb.thigh, hit, thighLocal[side]);
    }
    const shelf = bones.chest ?? bones.spine;
    shelf.updateWorldMatrix(true, true);
    shelf.getWorldPosition(hipWorld);
    landmark.copy(hipWorld);
    landmark.y += 0.07;
    landmark.z -= 0.1;
    const backHit = closestSkinnedVertex(skinned, landmark, UPPER_MATERIALS, landmark, 0.18);
    if (backHit) storeLocal(shelf, backHit, backLocal);
    if (bones.head) {
      bones.head.updateWorldMatrix(true, true);
      bones.head.getWorldPosition(hipWorld);
      landmark.copy(hipWorld);
      landmark.y += 0.08;
      landmark.z += 0.1;
      const face = closestSkinnedVertex(skinned, landmark, skin, landmark, 0.16);
      if (face) storeLocal(bones.head, face, foreheadLocal);
    }
  }

  return {
    get ready() { return ready; },
    anchors,
    secondary,
    reset() {
      shown.clear();
      exact.clear();
      headLagReady = false;
      secondary.reset();
    },
    measure(scene: Object3D, clips: AnimationClip[]): boolean {
      skinned = scene;
      const hips = bone(scene, 'Hips');
      const spine = bone(scene, 'Spine');
      const left = chain(scene, 'left');
      const right = chain(scene, 'right');
      if (!hips || !spine || !left || !right) return false;
      const chest = bone(scene, 'Spine2');
      bones = {
        hips, spine, chest,
        neck: bone(scene, 'Neck'),
        head: bone(scene, 'Head'),
        armLeft: bone(scene, 'UpperArm_L'),
        armRight: bone(scene, 'UpperArm_R'),
        elbowLeft: bone(scene, 'LowerArm_L'),
        elbowRight: bone(scene, 'LowerArm_R'),
        left, right,
      };
      const idle = clipNamed(clips, 'Idle');
      if (idle) {
        const mixer = poseClip(scene, idle, 0);
        left.foot.getWorldPosition(anchors.left.plant);
        right.foot.getWorldPosition(anchors.right.plant);
        pin('left', anchors.left.plant);
        pin('right', anchors.right.plant);
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
      } else {
        scene.updateMatrixWorld(true);
        left.foot.getWorldPosition(anchors.left.plant);
        right.foot.getWorldPosition(anchors.right.plant);
      }
      capture(scene, clips, 'left', 'KickLeft', KICK_CLIP_CONTACT_TIME, 'contact');
      capture(scene, clips, 'right', 'KickRight', KICK_CLIP_CONTACT_TIME, 'contact');
      capture(scene, clips, 'left', 'KickLeft', 0.42, 'follow');
      capture(scene, clips, 'right', 'KickRight', 0.42, 'follow');
      anchors.left.ball.set(-0.17 * 0.6, 0.72, 0.62);
      anchors.right.ball.set(0.17 * 0.6, 0.72, 0.62);
      if (idle) {
        const mixer = poseClip(scene, idle, 0);
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
      }
      captureBodyLandmarks();
      hipRest.copy(bones.hips.position);
      if (chest) chestRest.copy(chest.quaternion);
      headLagReady = false;
      ready = true;
      return true;
    },
    apply(engine: GameEngine, state: AnimationState | null, pose: Pose, dt: number) {
      if (!bones || !ready) return;
      // The mixer writes quaternions with matrixAutoUpdate off. IK has to read the posed matrices.
      bones.hips.traverse((obj) => {
        obj.matrixAutoUpdate = true;
        obj.matrixWorldAutoUpdate = true;
        obj.updateMatrix();
      });
      bones.hips.updateMatrixWorld(true);
      const trick = engine.trick?.kind ?? null;
      exact.clear();
      if (trick) applyTrick(engine, trick);
      else if (state === 'KickLeft' || state === 'KickRight') {
        const kickSide = state === 'KickLeft' ? 'left' : 'right';
        applyStrike(engine, kickSide, Math.max(0, engine.time - engine.lastKick[kickSide]));
      } else if (engine.celebration) {
        resetHipPlanar();
        pin('left', anchors.left.plant);
        pin('right', anchors.right.plant);
      } else if (state === 'Idle' || state === null) {
        applyIdle(engine, pose);
      } else if (state === 'Miss') {
        pin('left', anchors.left.plant);
        pin('right', anchors.right.plant);
      }

      const tau = engine.reducedMotion ? 0.12 : 0.08;
      ease(bones.spine, dt, tau);
      ease(bones.neck, dt, tau);
      ease(bones.armLeft, dt, tau);
      ease(bones.armRight, dt, tau);
      ease(bones.elbowLeft, dt, tau);
      ease(bones.elbowRight, dt, tau);
      remember(bones.spine);
      remember(bones.neck);
      remember(bones.armLeft);
      remember(bones.armRight);
      remember(bones.elbowLeft);
      remember(bones.elbowRight);

      const sec = secondary.step(dt, {
        headYaw: pose.headYaw,
        headPitch: pose.headPitch,
        torsoRoll: pose.torsoRoll,
        torsoPitch: pose.torsoPitch,
      }, engine.reducedMotion);
      if (bones.chest && !exact.has(bones.chest.uuid)) {
        bones.chest.quaternion.copy(chestRest).multiply(swing.setFromEuler(euler.set(sec.kitPitch, 0, sec.kitRoll)));
        bones.chest.updateMatrix();
      }
      if (bones.head) {
        const tracking = trick === 'header' || trick === 'neckStall' || trick === 'aroundTheWorld' || trick === 'groove';
        if (tracking || !headLagReady) {
          // Contact poses keep the aimed head. Lag is for hair and ordinary looking.
          headLag.copy(bones.head.quaternion);
          headLagReady = true;
        } else {
          headPosed.copy(bones.head.quaternion);
          const headTau = engine.reducedMotion ? 0.08 : 0.045;
          const k = 1 - Math.exp(-Math.min(Math.max(dt, 1 / 120), 1 / 20) / headTau);
          headLag.slerp(headPosed, k);
          bones.head.quaternion.copy(headLag);
          bones.head.updateMatrix();
        }
      }
    },
  };
}

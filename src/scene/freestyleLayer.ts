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
import { aimPoint, pinAnkle, solveTwoBone, forwardPole } from './footIk';
import { kickToeClearance, toeClearanceQuaternion } from './kickClearance';
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
const thighOffset = new Vector3();
const FOREHEAD = new Vector3(0, 0.1, 0.09);
const NAPE = new Vector3(0, 0.06, -0.1);
const target = new Vector3();
const shifted = new Vector3();
const ball = new Vector3();
const pole = new Vector3();
const hipWorld = new Vector3();
const euler = new Euler();
const swing = new Quaternion();
const headPosed = new Quaternion();
const clipThigh = new Quaternion();
const clipShin = new Quaternion();
const solvedThigh = new Quaternion();
const solvedShin = new Quaternion();

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

  function contactAnkle(side: Side, engine: GameEngine, out: Vector3): Vector3 {
    const anchor = anchors[side];
    ballNow(engine, ball);
    shifted.copy(ball).sub(anchor.ball);
    shifted.x = Math.min(0.14, Math.max(-0.14, shifted.x));
    shifted.y = Math.min(0.12, Math.max(-0.12, shifted.y));
    shifted.z = Math.min(0.12, Math.max(-0.12, shifted.z));
    return out.copy(anchor.contact).add(shifted);
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

  function applyStrike(engine: GameEngine, side: Side, since: number, underBall = false) {
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
      limb.foot.getWorldPosition(footWorld);
      if (underBall) {
        ballNow(engine, target);
        target.y -= 0.09;
        target.z -= 0.03;
      } else {
        contactAnkle(side, engine, target);
      }
      footWorld.lerp(target, weight);
      limb.thigh.getWorldPosition(hipWorld);
      solveTwoBone(limb.thigh, limb.shin, limb.foot, footWorld, forwardPole(hipWorld, pole));
      // Full contact lands on the ball. Earlier frames keep the clip's knee so the swing does not pop.
      if (weight < 0.999) {
        solvedThigh.copy(limb.thigh.quaternion);
        solvedShin.copy(limb.shin.quaternion);
        limb.thigh.quaternion.copy(clipThigh).slerp(solvedThigh, weight);
        limb.shin.quaternion.copy(clipShin).slerp(solvedShin, weight);
        limb.thigh.updateMatrix();
        limb.shin.updateMatrix();
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

  function applyThigh(engine: GameEngine, side: Side) {
    pin(other(side), anchors[other(side)].plant);
    const limb = leg(side);
    ballNow(engine, ball);
    // The authored thigh contact sits near the knee. A mid-thigh point cannot reach it.
    thighOffset.set(0, -0.4, 0.06);
    aimPoint(limb.thigh, thighOffset, ball, 1.55);
  }

  function applyHead(engine: GameEngine, local: Vector3, maxAngle: number) {
    if (!bones?.head) return;
    ballNow(engine, ball);
    aimPoint(bones.head, local, ball, maxAngle);
    hold(bones.head);
    pin('left', anchors.left.plant);
    pin('right', anchors.right.plant);
  }

  function applyNeck(engine: GameEngine) {
    if (!bones?.neck) return;
    ballNow(engine, ball);
    aimPoint(bones.neck, NAPE, ball, 0.9);
    hold(bones.neck);
    hold(bones.head);
    pin('left', anchors.left.plant);
    pin('right', anchors.right.plant);
  }

  function applyTrick(engine: GameEngine, kind: TrickKind) {
    const side = kickingSide(engine, null) ?? 'left';
    switch (kind) {
      case 'aroundTheWorld':
        pin(other(side), anchors[other(side)].plant);
        return;
      case 'thigh':
        applyThigh(engine, side);
        return;
      case 'header':
        applyHead(engine, FOREHEAD, 0.35);
        return;
      case 'neckStall':
        applyNeck(engine);
        return;
      case 'highFlick':
        applyStrike(engine, side, Math.max(0, engine.time - engine.lastKick[side]), true);
        return;
      case 'groove':
        // Dance steps own the feet. Planting both ankles would erase the shuffle.
        return;
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
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
        // The dance pose owns the feet. Idle planting would glue a shuffle to the floor.
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
      if (bones.chest) {
        bones.chest.quaternion.copy(chestRest).multiply(swing.setFromEuler(euler.set(sec.kitPitch, 0, sec.kitRoll)));
        bones.chest.updateMatrix();
      }
      if (bones.head) {
        const tracking = trick === 'header' || trick === 'neckStall';
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

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine/engine';
import { computePose, createPose, kickEnvelope, solveLeg } from './pose';
import { ANIMATION_STATES, selectAnimationState, validateModel, BONE_NAMES, MATERIAL_NAMES, skinMaterialColors , KICK_CLIP_CONTACT_TIME, KICK_CLIP_START, KICK_CONTACT_TIME } from './rig';
import { SKINS } from '../game/skins';

const stepN = (e: GameEngine, n: number) => { for (let i = 0; i < n; i++) e.step(e.config.fixedStep); };

function playing() {
  const e = new GameEngine();
  e.prepare('ready');
  e.press('left'); e.release('left');
  return e;
}

function toContact(e: GameEngine, ms = 5) {
  for (let i = 0; i < 100000; i++) {
    if (e.ball.vy < 0 && e.timingDeltaMs() <= ms) return;
    e.step(e.config.fixedStep);
  }
  throw new Error('no contact');
}

describe('solveLeg', () => {
  it('returns finite angles for reachable targets', () => {
    const l = solveLeg('left', { x: -0.1, y: 0.2, z: 0.4 });
    expect(Object.values(l).every(Number.isFinite)).toBe(true);
    expect(l.thigh).toBeLessThan(0);
    expect(l.knee).toBeGreaterThan(0);
  });

  it('clamps unreachable targets without NaN', () => {
    for (const t of [{ x: 0, y: -5, z: 5 }, { x: 3, y: 5, z: 0 }, { x: 0, y: 0.95, z: 0 }]) {
      const l = solveLeg('right', t);
      expect(Object.values(l).every(Number.isFinite)).toBe(true);
    }
  });
});

describe('kickEnvelope', () => {
  it('is zero before the kick, peaks at contact and decays', () => {
    expect(kickEnvelope(-0.1)).toBe(0);
    expect(kickEnvelope(0.04)).toBeCloseTo(1, 5);
    expect(kickEnvelope(0.5)).toBeLessThan(kickEnvelope(0.1));
    expect(kickEnvelope(0.02)).toBeCloseTo(0.5, 5);
  });
});

describe('computePose', () => {
  it('idles with a small breathing motion and a rested leg', () => {
    const e = new GameEngine();
    e.prepare('menu');
    const a = computePose(e, createPose()).bodyY;
    stepN(e, 100);
    const p = computePose(e, createPose());
    expect(Math.abs(p.bodyY)).toBeLessThan(0.02);
    expect(Math.abs(p.bodyY - a)).toBeGreaterThan(0);
    expect(p.legs.left.thigh).toBe(0);
  });

  it('head tracks the ball horizontally', () => {
    const e = playing();
    e.ball.x = 1;
    expect(computePose(e).headYaw).toBeGreaterThan(0);
    e.ball.x = -1;
    expect(computePose(e).headYaw).toBeLessThan(0);
  });

  it('swings the kicking leg only, at contact time', () => {
    const e = playing();
    toContact(e);
    e.press('right'); e.release('right');
    stepN(e, 6);
    const p = computePose(e);
    expect(p.legs.right.thigh).toBeLessThan(-0.1);
    expect(p.legs.left.thigh).toBe(0);
    expect(p.torsoPitch).toBeGreaterThan(0.05);
  });

  it('raises the arms to celebrate a perfect kick', () => {
    const e = playing();
    toContact(e, 5);
    e.press('left'); e.release('left');
    stepN(e, 30);
    expect(e.lastKickGrade).toBe('perfect');
    expect(computePose(e).armLeft).toBeGreaterThan(1.2);
  });

  it('droops after the ball drops', () => {
    const e = playing();
    for (let i = 0; i < 5000 && e.phase === 'playing'; i++) e.step(e.config.fixedStep);
    stepN(e, 60);
    const p = computePose(e);
    expect(e.phase).toBe('dropped');
    expect(p.headPitch).toBeGreaterThan(0.2);
    expect(p.armLeft).toBeLessThan(0.2);
  });

  it('holds the foot at the ball during a foot stall', () => {
    const e = playing();
    toContact(e);
    e.press('left');
    stepN(e, 60);
    expect(e.contact?.kind).toBe('stall');
    expect(computePose(e).legs.left.thigh).toBeLessThan(-0.1);
  });
});

describe('GLB rig contract', () => {
  it('selects named animation states from engine state', () => {
    const e = new GameEngine();
    e.prepare('menu');
    expect(selectAnimationState(e).state).toBe('Idle');
    e.prepare('ready');
    expect(selectAnimationState(e).state).toBe('Idle');
    e.press('left'); e.release('left');
    stepN(e, 5);
    expect(selectAnimationState(e).state).toBe('KickLeft');
    stepN(e, 80);
    expect(selectAnimationState(e).state).toBe('Idle');
    toContact(e);
    e.press('right');
    stepN(e, 60);
    const stall = selectAnimationState(e);
    expect(stall.state).toBe('KickRight');
    expect(stall.clipTime).toBeCloseTo(KICK_CLIP_CONTACT_TIME, 5);
    e.release('right');
    stepN(e, 5);
    expect(selectAnimationState(e).state).toBe('KickRight');
    stepN(e, 50);
    expect(selectAnimationState(e).state).toBe('Celebrate');
    for (let i = 0; i < 5000 && e.phase === 'playing'; i++) e.step(e.config.fixedStep);
    expect(selectAnimationState(e).state).toBe('Miss');
  });

  it('only produces states that have documented clip names', () => {
    expect([...ANIMATION_STATES]).toEqual(['Idle', 'KickLeft', 'KickRight', 'Miss', 'Celebrate']);
    expect(ANIMATION_STATES).toHaveLength(5);
  });

  it('restarts a repeated kick through a changing token', () => {
    const e = playing();
    toContact(e); e.press('left'); e.release('left'); stepN(e, 3);
    const a = selectAnimationState(e).token;
    toContact(e); e.press('right'); e.release('right'); stepN(e, 3);
    expect(selectAnimationState(e).token).not.toBe(a);
  });

  it('validates a model against the contract', () => {
    const full = validateModel(Object.values(BONE_NAMES), ANIMATION_STATES, Object.values(MATERIAL_NAMES));
    expect(full).toEqual({ missingBones: [], missingClips: [], missingMaterials: [] });
    const partial = validateModel(['Hips'], ['Idle'], ['Shirt']);
    expect(partial.missingBones).toContain('Head');
    expect(partial.missingClips).toContain('KickLeft');
    expect(partial.missingMaterials).toContain('Hair');
  });

  it('accepts Freddie/UE bone aliases with L/R swap as satisfying the bone contract', () => {
    const ue = [
      'pelvis', 'spine_01', 'Head',
      'upperarm_r', 'upperarm_l',
      'thigh_r', 'thigh_l', 'calf_r', 'calf_l', 'foot_r', 'foot_l',
    ];
    const report = validateModel(ue, [], Object.values(MATERIAL_NAMES));
    expect(report.missingBones).toEqual([]);
    expect(report.missingClips).toEqual([...ANIMATION_STATES]);
    expect(report.missingMaterials).toEqual([]);
  });

  it('provides a colour for every contract material in every skin', () => {
    for (const skin of SKINS) {
      const colors = skinMaterialColors(skin);
      for (const name of Object.values(MATERIAL_NAMES)) expect(colors[name]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('GLB kick timing', () => {
  it('starts kick clips so the 0.30 s contact frame lands at the engine contact offset', () => {
    expect(KICK_CLIP_CONTACT_TIME).toBeCloseTo(0.3);
    expect(KICK_CLIP_START + KICK_CONTACT_TIME).toBeCloseTo(KICK_CLIP_CONTACT_TIME);
  });
});

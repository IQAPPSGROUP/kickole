import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine/engine';
import { buildScenario } from './inspector';
import { KICK_CLIP_CONTACT_TIME, KICK_CLIP_START, kickClipTime, selectAnimationState } from './rig';

const H = new GameEngine().config.fixedStep;
const step = (e: GameEngine, n = 1) => { for (let i = 0; i < n; i++) e.step(H); };

function engineAtPerfectTap() {
  const e = new GameEngine();
  e.prepare('ready');
  e.press('right'); e.release('right');
  for (let i = 0; i < 100000 && !(e.ball.vy < 0 && e.timingDeltaMs() <= 0); i++) step(e);
  return e;
}

describe('foot contact vs ball response', () => {
  it('keeps the ball still at the foot until contactDelay after the tap, then kicks it up', () => {
    const e = engineAtPerfectTap();
    const tap = e.time;
    e.press('left'); e.release('left');
    const start = { ...e.ball };
    let responseAt = -1;
    e.on((ev) => { if (ev.type === 'kick') responseAt = e.time - tap; });
    for (let i = 0; i < 12; i++) {
      step(e);
      if (responseAt < 0) {
        expect(e.ball.vy).toBeLessThanOrEqual(0);
        expect(e.ball.y).toBeCloseTo(e.config.contactHeight, 6);
        expect(e.ball.x).toBeCloseTo(start.x, 9);
        expect(e.ball.z).toBeCloseTo(start.z, 9);
      }
    }
    expect(start.y).toBeCloseTo(e.config.contactHeight, 6);
    expect(responseAt).toBeGreaterThanOrEqual(e.config.contactDelay - 1e-9);
    expect(responseAt).toBeLessThanOrEqual(e.config.contactDelay + H + 1e-9);
    expect(e.ball.vy).toBeGreaterThan(3);
  });

  it('plays the kick clip so its 0.30 s frame is reached exactly when the ball responds', () => {
    const e = engineAtPerfectTap();
    e.press('left'); e.release('left');
    let clipAtResponse = -1;
    e.on((ev) => { if (ev.type === 'kick') clipAtResponse = kickClipTime(e, 'left'); });
    step(e, 12);
    expect(Math.abs(clipAtResponse - KICK_CLIP_CONTACT_TIME)).toBeLessThanOrEqual(H + 1e-9);
  });

  it('clip time never runs backwards during a kick and keeps advancing after contact', () => {
    const e = engineAtPerfectTap();
    e.press('right'); e.release('right');
    let prev = -1;
    for (let i = 0; i < 60; i++) {
      step(e);
      const s = selectAnimationState(e);
      if (s.state !== 'KickRight') break;
      expect(s.clipTime!).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s.clipTime!;
    }
    expect(prev).toBeGreaterThan(KICK_CLIP_CONTACT_TIME);
  });
});

describe('foot stall', () => {
  it('freezes the ball and holds the contact pose, then resumes from the contact frame without a jump', () => {
    const e = engineAtPerfectTap();
    e.press('left');
    const clips: number[] = [];
    let frozen: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 90; i++) {
      step(e);
      if (e.contact?.kind === 'stall') {
        frozen ??= { x: e.ball.x, y: e.ball.y, z: e.ball.z };
        expect(e.ball.x).toBe(frozen.x); expect(e.ball.y).toBe(frozen.y); expect(e.ball.z).toBe(frozen.z);
        expect(e.ball.vy).toBe(0);
      }
      if (e.contact) clips.push(kickClipTime(e, 'left'));
    }
    expect(frozen).not.toBeNull();
    expect(Math.max(...clips)).toBeLessThanOrEqual(KICK_CLIP_CONTACT_TIME + 1e-9);
    expect(clips[clips.length - 1]).toBeCloseTo(KICK_CLIP_CONTACT_TIME, 6);
    const before = kickClipTime(e, 'left');
    e.release('left');
    step(e);
    const after = kickClipTime(e, 'left');
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after - before).toBeLessThanOrEqual(2 * H);
    expect(e.ball.vy).toBeGreaterThan(3);
    expect(e.stats.stalls).toBe(1);
  });
});

describe('inspector scenarios', () => {
  it('shows no ball response at clip 0.25 s, the response at 0.30 s and a rising ball at 0.35 s', () => {
    const at = (clip: number) => { const e = new GameEngine(); return buildScenario(e, 'left', 'kick', clip - KICK_CLIP_START); };
    const a = at(0.25), b = at(0.3), c = at(0.35);
    expect(a.contactAt).toBeNull();
    expect(a.ball.vy).toBeLessThan(0);
    expect(b.contactAt).not.toBeNull();
    expect(Math.abs(b.contactAt! - 0.04)).toBeLessThanOrEqual(H + 1e-9);
    expect(c.ball.vy).toBeGreaterThan(3);
    expect(c.ball.y).toBeGreaterThan(b.ball.y);
  });

  it('is repeatable', () => {
    const a = buildScenario(new GameEngine(), 'right', 'kick', 0.1);
    const b = buildScenario(new GameEngine(), 'right', 'kick', 0.1);
    expect(a).toEqual(b);
  });
});

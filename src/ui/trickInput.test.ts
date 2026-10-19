import { describe, expect, it } from 'vitest';
import { applyNeckPointer, classifyTrickRelease, type NeckPointerState } from './trickInput';

describe('trick button release', () => {
  it('fires on a tap during play and ignores a drag', () => {
    expect(classifyTrickRelease({ phase: 'playing', dx: 2, dy: -4 })).toBe('fire');
    expect(classifyTrickRelease({ phase: 'playing', dx: 40, dy: 0 })).toBe('ignore');
  });

  it('reports locked before the first kick', () => {
    expect(classifyTrickRelease({ phase: 'ready', dx: 0, dy: 0 })).toBe('locked');
    expect(classifyTrickRelease({ phase: 'menu', dx: 1, dy: 1 })).toBe('locked');
  });
});

describe('neck pointer events', () => {
  const down = { type: 'pointerdown' as const, pointerId: 4 };
  const up = { type: 'pointerup' as const, pointerId: 4 };
  const lost = { type: 'lostpointercapture' as const, pointerId: 4 };

  it('presses on pointerdown and releases on pointerup', () => {
    let state: NeckPointerState = { pointerId: null };
    const pressed = applyNeckPointer(state, down, 'playing');
    expect(pressed.action).toBe('press');
    state = pressed.state;
    const dropped = applyNeckPointer(state, lost, 'playing');
    expect(dropped.action).toBe('none');
    expect(dropped.state.pointerId).toBe(4);
    const released = applyNeckPointer(dropped.state, up, 'playing');
    expect(released.action).toBe('release');
    expect(released.state.pointerId).toBeNull();
  });

  it('a lost capture does not end a hold, and a second finger is ignored', () => {
    const state: NeckPointerState = { pointerId: 4 };
    expect(applyNeckPointer(state, { type: 'pointerup', pointerId: 9 }, 'playing').action).toBe('none');
    expect(applyNeckPointer(state, { type: 'pointercancel', pointerId: 4 }, 'playing').action).toBe('release');
  });

  it('a pointerdown before play is locked and does not press', () => {
    const result = applyNeckPointer({ pointerId: null }, down, 'ready');
    expect(result.action).toBe('locked');
    expect(result.state.pointerId).toBe(4);
  });
});

import type { Grade } from '../engine/config';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}

/** Synthesised sound effects; no audio assets needed. */
export const sfx = {
  kick(grade: Grade, streak: number) {
    if (grade === 'perfect') {
      blip(520 + Math.min(streak, 12) * 30, 0.16, 'triangle', 0.18, 1040);
    } else {
      blip(240, 0.09, 'square', 0.08, 120);
    }
  },
  miss() { blip(150, 0.12, 'sawtooth', 0.06, 90); },
  drop() { blip(220, 0.5, 'sawtooth', 0.12, 55); },
  stall() { blip(330, 0.2, 'sine', 0.12, 660); },
};

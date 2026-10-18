import type { Grade } from '../engine/config';
import { easeSamba, sambaRate } from './samba';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const extra = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AC = window.AudioContext ?? extra.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo && slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
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
  milestone() {
    blip(392, 0.09, 'triangle', 0.1, 523);
    blip(523, 0.11, 'triangle', 0.09, 784, 0.08);
    blip(784, 0.18, 'sine', 0.07, 1175, 0.15);
  },
  cheer() {
    blip(330, 0.16, 'triangle', 0.05, 520);
    blip(415, 0.2, 'triangle', 0.05, 660, 0.05);
    blip(523, 0.26, 'sine', 0.04, 784, 0.1);
  },
  pop() {
    blip(220, 0.1, 'square', 0.07, 80);
    blip(680, 0.08, 'triangle', 0.06, 180);
  },
};

const BPM = 104;
const EIGHTH = 60 / BPM / 2;
const MELODY = [659.25, 0, 783.99, 880, 0, 783.99, 659.25, 523.25, 587.33, 0, 698.46, 783.99, 0, 659.25, 587.33, 523.25];
const BASS = [130.81, 0, 0, 196, 0, 164.81, 0, 130.81, 146.83, 0, 0, 220, 0, 174.61, 0, 196];

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let musicGain: GainNode | null = null;
let stepIndex = 0;
let nextTime = 0;
let currentRate = 1;
let targetRate = 1;

function tone(c: AudioContext, dest: AudioNode, freq: number, time: number, dur: number, type: OscillatorType, gain: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g).connect(dest);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function stopMusic() {
  running = false;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (musicGain && ctx) {
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(0, t);
  }
}

function pump() {
  if (!running || !ctx || !musicGain) return;
  currentRate = easeSamba(currentRate, targetRate);
  const step = EIGHTH / currentRate;
  const horizon = ctx.currentTime + 0.28;
  let guard = 0;
  while (nextTime < horizon && guard < 8) {
    const i = stepIndex % MELODY.length;
    const when = nextTime;
    const melody = MELODY[i];
    const bass = BASS[i];
    if (melody) tone(ctx, musicGain, melody, when, step * 0.9, 'triangle', 0.055);
    if (bass) tone(ctx, musicGain, bass, when, step * 1.25, 'sine', 0.07);
    if (i % 8 === 0) {
      tone(ctx, musicGain, 523.25, when, 0.09, 'triangle', 0.03);
      tone(ctx, musicGain, 659.25, when, 0.09, 'sine', 0.024);
    }
    stepIndex = (stepIndex + 1) % MELODY.length;
    nextTime += step;
    guard += 1;
  }
  if (running) timer = setTimeout(pump, 80);
}

function startMusic() {
  const c = getCtx();
  if (!c) return;
  if (!musicGain) {
    musicGain = c.createGain();
    musicGain.connect(c.destination);
  }
  running = true;
  const t = c.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(0.8, t);
  if (nextTime < t) nextTime = t + 0.05;
  pump();
}

/** Beach/carnival loop. Call sync from a user gesture. Playback rate follows the perfect streak. */
export const music = {
  sync(enabled: boolean) {
    if (!enabled) {
      stopMusic();
      return;
    }
    if (running) {
      const c = getCtx();
      if (c && c.state === 'suspended') void c.resume();
      return;
    }
    startMusic();
  },
  setTarget(perfectStreak: number) {
    targetRate = sambaRate(perfectStreak);
    if (!running) currentRate = targetRate;
  },
};

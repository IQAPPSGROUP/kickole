import type { Grade } from '../engine/config';
import { cheerWeight } from './audioPolicy';

/**
 * All game audio is synthesised here. There are no sampled recordings.
 * See public/audio/LICENSE.txt.
 */

let ctx: AudioContext | null = null;
let unlocked = false;
let foreground = true;
let graphReady = false;

let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let crowdGain: GainNode | null = null;
let crowdDepth: GainNode | null = null;
let noise: AudioBuffer | null = null;

let scheduler: ReturnType<typeof setInterval> | null = null;
let nextNote = 0;
let step = 0;
let mode: 'menu' | 'play' = 'menu';

let bed = { mode: 'menu' as 'menu' | 'play', music: true, sfx: true, crowd: 0 };
let lastCheer = -10;
let pendingCheer: string | null = null;

const CHEER_GAP = 1.35;

interface CapacitorApp {
  addListener(event: 'appStateChange', cb: (state: { isActive: boolean }) => void): void;
}

function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (foreground && ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const length = c.sampleRate;
  noise = c.createBuffer(1, length, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function ensureGraph(c: AudioContext) {
  if (graphReady) return;
  master = c.createGain();
  master.gain.value = foreground ? 1 : 0;
  master.connect(c.destination);

  musicGain = c.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);

  sfxGain = c.createGain();
  sfxGain.gain.value = 1;
  sfxGain.connect(master);

  crowdGain = c.createGain();
  crowdGain.gain.value = 0;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  filter.Q.value = 0.6;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  src.connect(filter);
  filter.connect(crowdGain);
  crowdGain.connect(master);
  src.start();

  const lfo = c.createOscillator();
  lfo.frequency.value = 0.16;
  crowdDepth = c.createGain();
  crowdDepth.gain.value = 0;
  lfo.connect(crowdDepth);
  crowdDepth.connect(crowdGain.gain);
  lfo.start();

  graphReady = true;
}

function sfxBus(): GainNode | null {
  if (!unlocked || !foreground || !bed.sfx) return null;
  const c = audioContext();
  if (!c) return null;
  ensureGraph(c);
  return sfxGain;
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const bus = sfxBus();
  const c = ctx;
  if (!bus || !c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo && slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur);
}

function burst(at: number, dur: number, freq: number, q: number, gain: number, bus: GainNode) {
  const c = ctx;
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(g).connect(bus);
  src.start(at);
  src.stop(at + dur + 0.02);
}

function tone(at: number, freq: number, dur: number, type: OscillatorType, gain: number, bus: GainNode, slideTo?: number) {
  const c = ctx;
  if (!c || freq <= 0) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo && slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.02);
}

const CHORDS = [
  [65.41, 196, 261.63, 329.63],
  [98, 196, 246.94, 293.66],
  [110, 220, 261.63, 329.63],
  [87.31, 174.61, 220, 261.63],
];

function scheduleStep(index: number, at: number) {
  const bus = musicGain;
  const c = ctx;
  if (!bus || !c || !bed.music || !foreground) return;
  const play = mode === 'play';
  const bar = Math.floor(index / 16) % 4;
  const sixteenth = index % 16;
  const chord = CHORDS[bar % CHORDS.length];
  if (sixteenth === 0) {
    tone(at, chord[0], play ? 0.28 : 0.7, 'sine', play ? 0.07 : 0.045, bus);
    tone(at, chord[2], play ? 0.45 : 0.9, 'triangle', play ? 0.03 : 0.04, bus);
    tone(at, chord[3], play ? 0.45 : 0.9, 'sine', play ? 0.02 : 0.03, bus);
  }
  if (!play) return;
  if (sixteenth % 8 === 0 || sixteenth === 6 || sixteenth === 14) tone(at, 150, 0.1, 'sine', 0.16, bus, 48);
  if (sixteenth === 4 || sixteenth === 12) {
    burst(at, 0.07, 1800, 0.7, 0.05, bus);
    tone(at, chord[1], 0.08, 'triangle', 0.04, bus);
  }
  if (sixteenth % 2 === 0) tone(at, 3200, 0.025, 'square', 0.012, bus);
}

function bpm(): number {
  return mode === 'play' ? 108 : 82;
}

function runScheduler() {
  const c = ctx;
  if (!c || !bed.music || !foreground || !unlocked) return;
  const horizon = c.currentTime + 0.25;
  const stepLength = 60 / bpm() / 4;
  if (nextNote < c.currentTime) nextNote = c.currentTime + 0.05;
  while (nextNote < horizon) {
    scheduleStep(step % 64, nextNote);
    nextNote += stepLength;
    step += 1;
  }
}

function startScheduler() {
  if (scheduler != null || !unlocked) return;
  scheduler = setInterval(runScheduler, 80);
  runScheduler();
}

function stopScheduler() {
  if (scheduler != null) clearInterval(scheduler);
  scheduler = null;
}

function applyCrowd() {
  const c = ctx;
  if (!crowdGain || !crowdDepth || !c) return;
  const level = foreground && bed.sfx ? bed.crowd : 0;
  const gain = level * 0.055;
  crowdGain.gain.setTargetAtTime(Math.max(0.0001, gain), c.currentTime, 0.4);
  crowdDepth.gain.setTargetAtTime(gain * 0.45, c.currentTime, 0.4);
}

function applyMusic() {
  const c = ctx;
  if (!musicGain || !c) return;
  const on = unlocked && foreground && bed.music;
  const level = !on ? 0.0001 : mode === 'play' ? 0.9 : 0.55;
  musicGain.gain.setTargetAtTime(level, c.currentTime, 0.35);
  if (on) startScheduler();
  else stopScheduler();
}

function applyBed() {
  mode = bed.mode;
  if (!unlocked) return;
  const c = audioContext();
  if (!c) return;
  ensureGraph(c);
  applyMusic();
  applyCrowd();
}

function playCheerNow(id: string) {
  const bus = sfxBus();
  const c = ctx;
  if (!bus || !c) return;
  const at = c.currentTime;
  lastCheer = at;
  const big = cheerWeight(id) >= 2;
  const root = big ? 392 : 523.25;
  tone(at, root, big ? 0.42 : 0.22, 'triangle', big ? 0.12 : 0.08, bus);
  tone(at + 0.08, root * 1.25, big ? 0.36 : 0.18, 'triangle', big ? 0.09 : 0.06, bus);
  tone(at + 0.16, root * 1.5, big ? 0.4 : 0.2, 'sine', big ? 0.08 : 0.05, bus);
  if (big) burst(at, 0.35, 900, 0.4, 0.06, bus);
}

function flushCheer() {
  if (!pendingCheer) return;
  const c = ctx;
  const now = c?.currentTime ?? 0;
  if (now - lastCheer < CHEER_GAP) return;
  const id = pendingCheer;
  pendingCheer = null;
  playCheerNow(id);
}

/** Synthesised kicks, misses and stalls. No audio assets. */
export const sfx = {
  kick(grade: Grade, streak: number) {
    if (grade === 'perfect') blip(520 + Math.min(streak, 12) * 30, 0.16, 'triangle', 0.18, 1040);
    else blip(240, 0.09, 'square', 0.08, 120);
  },
  miss() { blip(150, 0.12, 'sawtooth', 0.06, 90); },
  drop() { blip(220, 0.5, 'sawtooth', 0.12, 55); },
  stall() { blip(330, 0.2, 'sine', 0.12, 660); },
};

export interface AudioBed {
  mode: 'menu' | 'play';
  music: boolean;
  sfx: boolean;
  /** 0..1 crowd energy while a run is live. */
  crowd: number;
}

/** Remember the mix. The graph itself starts on the first gesture. */
export function setBed(next: AudioBed) {
  const modeChanged = next.mode !== bed.mode;
  bed = next;
  if (modeChanged) {
    step = 0;
    nextNote = 0;
  }
  applyBed();
}

/** Browser autoplay: create and resume the context from a user gesture. */
export function unlockAudio() {
  unlocked = true;
  applyBed();
}

export function cheer(id: string) {
  if (!unlocked || !foreground || !bed.sfx) return;
  const c = audioContext();
  if (!c) return;
  ensureGraph(c);
  if (c.currentTime - lastCheer < CHEER_GAP) {
    if (!pendingCheer || cheerWeight(id) >= cheerWeight(pendingCheer)) pendingCheer = id;
    return;
  }
  pendingCheer = null;
  playCheerNow(id);
}

function setForeground(active: boolean) {
  foreground = active;
  const c = ctx;
  if (!c || !unlocked) return;
  if (!active) {
    stopScheduler();
    master?.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
    void c.suspend();
    return;
  }
  void c.resume().then(() => {
    nextNote = 0;
    master?.gain.setTargetAtTime(1, c.currentTime, 0.08);
    applyBed();
  });
}

let lifecycleInstalled = false;

/**
 * Pause when the page is hidden. Inside Capacitor, also follow the native
 * App plugin when the host has registered it on `window.Capacitor`.
 */
export function installAudioLifecycle() {
  if (lifecycleInstalled || typeof document === 'undefined') return;
  lifecycleInstalled = true;
  document.addEventListener('visibilitychange', () => setForeground(!document.hidden));
  window.addEventListener('pagehide', () => setForeground(false));
  window.addEventListener('pageshow', () => setForeground(!document.hidden));
  const app = (globalThis as { Capacitor?: { Plugins?: { App?: CapacitorApp } } }).Capacitor?.Plugins?.App;
  if (app?.addListener) app.addListener('appStateChange', (state) => setForeground(state.isActive));
  setInterval(() => { if (foreground && unlocked) flushCheer(); }, 200);
}

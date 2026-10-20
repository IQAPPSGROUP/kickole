import type { Grade } from '../engine/config';
import {
  DEFAULT_OUTPUT_LATENCY_SEC,
  GAMEPLAY_BPM,
  MENU_BPM,
  readBeat,
  type BeatClock,
} from './beat';
import { cheerWeight } from './audioPolicy';
import {
  MUSIC_MENU_LEVEL,
  MUSIC_PLAY_LEVEL,
  createMusicGraph,
  playCheerStab,
  playScratch,
  renderMusicTake,
  scheduleMusicStep,
  swingDelay,
  type MusicGraph,
} from './musicBed';

/**
 * All game audio is synthesised here. There are no sampled recordings.
 * The beds are original boom-bap loops (see musicBed.ts).
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
let step = 0;
/** Audio-clock time of sixteenth 0. Beat 0 is this origin; quarter notes are every 4 steps. */
let gridOrigin = 0;
/** Performance-clock origin used for the visual pulse before the audio graph is running. */
let visualOrigin = 0;
let mode: 'menu' | 'play' = 'menu';
let musicGraph: MusicGraph | null = null;

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
  musicGraph = createMusicGraph(c);
  musicGraph.out.connect(musicGain);

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

function scheduleStep(index: number, at: number) {
  const graph = musicGraph;
  if (!graph || !bed.music || !foreground) return;
  const stepLength = 60 / bpm() / 4;
  scheduleMusicStep(graph, mode, index, at, stepLength);
}

function bpm(): number {
  return mode === 'play' ? GAMEPLAY_BPM : MENU_BPM;
}

function clockSeconds(): number {
  if (typeof performance !== 'undefined') return performance.now() / 1000;
  return Date.now() / 1000;
}

function runScheduler() {
  const c = ctx;
  if (!c || !bed.music || !foreground || !unlocked) return;
  const stepLength = 60 / bpm() / 4;
  if (gridOrigin <= 0) gridOrigin = c.currentTime + 0.05;
  const scheduled = gridOrigin + step * stepLength;
  const behind = c.currentTime - scheduled;
  if (behind > 0.3) step += Math.floor(behind / stepLength);
  const horizon = c.currentTime + 0.25;
  while (gridOrigin + step * stepLength < horizon) {
    const at = gridOrigin + step * stepLength + swingDelay(step, stepLength, mode);
    if (at >= c.currentTime - 0.02) scheduleStep(step, at);
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
  const level = !on ? 0.0001 : mode === 'play' ? MUSIC_PLAY_LEVEL : MUSIC_MENU_LEVEL;
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
  const graph = musicGraph;
  if (!bus || !c || !graph) return;
  const at = c.currentTime;
  lastCheer = at;
  const big = cheerWeight(id) >= 2;
  playCheerStab(c, graph.noise, bus, at, big);
  if (id.startsWith('streak:') && bed.music) playScratch(graph, at);
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
    gridOrigin = 0;
    visualOrigin = 0;
  }
  applyBed();
}

/** Browser autoplay: create and resume the context from a user gesture. */
/**
 * Quarter-note clock for groove scoring and the on-screen beat pulse.
 * `music` is false while the bed is muted; `phase` and `pulse` still advance.
 */
export function beatClock(): BeatClock {
  const bpmNow = bpm();
  const c = ctx;
  const latency = c
    ? Math.min(0.12, c.outputLatency || c.baseLatency || DEFAULT_OUTPUT_LATENCY_SEC)
    : DEFAULT_OUTPUT_LATENCY_SEC;
  const now = c && unlocked ? c.currentTime : clockSeconds();
  let origin = gridOrigin;
  if (!(origin > 0)) {
    if (!(visualOrigin > 0)) visualOrigin = now;
    origin = visualOrigin;
  }
  const music = unlocked && foreground && bed.music;
  const raw = readBeat({ now, origin, bpm: bpmNow, latency, music });
  // The ring peaks when the note is heard, not when it was scheduled.
  const heard = readBeat({ now: now - latency, origin, bpm: bpmNow, latency, music });
  return { ...raw, phase: heard.phase, pulse: heard.pulse };
}

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
    gridOrigin = 0;
    visualOrigin = 0;
    step = 0;
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

export { renderMusicTake };

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __renderMusic?: typeof renderMusicTake }).__renderMusic = renderMusicTake;
}

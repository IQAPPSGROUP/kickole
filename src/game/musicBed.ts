import { GAMEPLAY_BPM, MENU_BPM } from './beat';

/**
 * Original street boom-bap bed. Oscillators and noise only — no samples.
 * Saturated kick, a cracked snare, a driven 808, and short minor chops.
 * Hats stay on the swung grid with a short tick. Kicks duck the bass,
 * hats and chops so the loop pumps. One vinyl loop, a short delay, and a
 * compressor plus limiter on the music bus. Drums are scheduled a few
 * notes ahead, not streamed. Streak scratches still land on this bus.
 */

export type BedMode = 'menu' | 'play';

export const INTRO_BARS = 2;
export const LOOP_BARS = 16;

/** Steady-state level after the limiter. SFX bypass this bus. */
export const MUSIC_PLAY_LEVEL = 0.28;
export const MUSIC_MENU_LEVEL = 0.22;

const PLAY_SWING = 0.62;
const MENU_SWING = 0.55;

export interface StepPlan {
  bar: number;
  intro: boolean;
  /** Bar inside the 16-bar loop, or -1 during the intro. */
  loopBar: number;
  section: 'intro' | 'A' | 'B';
  /** Last bar of each 8-bar half. */
  fill: boolean;
  sixteenth: number;
}

export interface KitHits {
  kick: boolean;
  snare: boolean;
  openHat: boolean;
}

export interface BassEvent {
  freq: number;
  durSteps: number;
}

interface Chord {
  bass: number;
  fifth: number;
  notes: readonly number[];
  color: readonly number[];
}

/** Dark minor loop. Section B swaps to `color`, still minor, a little tighter. */
const PLAY_CHORDS: readonly Chord[] = [
  { bass: 55, fifth: 41.2, notes: [110, 130.81, 164.81], color: [164.81, 196, 246.94] },
  { bass: 36.71, fifth: 55, notes: [146.83, 174.61, 220], color: [174.61, 207.65, 261.63] },
  { bass: 41.2, fifth: 61.74, notes: [164.81, 196, 246.94], color: [130.81, 155.56, 196] },
  { bass: 43.65, fifth: 32.7, notes: [174.61, 207.65, 261.63], color: [146.83, 174.61, 220] },
];

const MENU_CHORDS: readonly Chord[] = [
  { bass: 36.71, fifth: 55, notes: [146.83, 174.61, 220], color: [110, 130.81, 164.81] },
  { bass: 55, fifth: 41.2, notes: [110, 130.81, 164.81], color: [130.81, 164.81, 196] },
  { bass: 49, fifth: 36.71, notes: [98, 116.54, 146.83], color: [116.54, 138.59, 174.61] },
  { bass: 41.2, fifth: 30.87, notes: [82.41, 98, 123.47], color: [98, 116.54, 146.83] },
];

const HAT_ROW = [0.92, 0.24, 0.58, 0.18, 0.78, 0.3, 0.5, 0.16, 0.88, 0.22, 0.62, 0.2, 0.74, 0.28, 0.52, 0.14];

export interface MusicGraph {
  ctx: BaseAudioContext;
  /** Post limiter. The game turns this down so the bed sits under the SFX. */
  out: GainNode;
  /** Pre-compressor sum. */
  mix: GainNode;
  bassDuck: GainNode;
  /** Sidechain target for the 808, hats and chops. Kicks and the snare stay outside it. */
  pump: GainNode;
  noise: AudioBuffer;
  kickBus: GainNode;
  kickClick: BiquadFilterNode;
  snareNoise: BiquadFilterNode;
  snareCrack: BiquadFilterNode;
  snareBus: GainNode;
  closedHat: BiquadFilterNode;
  openHat: BiquadFilterNode;
  chordIn: BiquadFilterNode;
}

export function planStep(step: number): StepPlan {
  const bar = Math.floor(step / 16);
  const sixteenth = ((step % 16) + 16) % 16;
  const intro = bar < INTRO_BARS;
  const loopBar = intro ? -1 : (bar - INTRO_BARS) % LOOP_BARS;
  const section: StepPlan['section'] = intro ? 'intro' : loopBar < 8 ? 'A' : 'B';
  const fill = !intro && loopBar % 8 === 7;
  return { bar, intro, loopBar, section, fill, sixteenth };
}

/** Extra delay applied to odd sixteenths. Even sixteenths stay on the grid. */
export function swingDelay(step: number, stepLength: number, mode: BedMode): number {
  if (step % 2 === 0) return 0;
  const ratio = mode === 'play' ? PLAY_SWING : MENU_SWING;
  return (2 * ratio - 1) * stepLength;
}

export function hatLevel(step: number, mode: BedMode): number {
  const plan = planStep(step);
  if ((mode === 'menu' || plan.intro) && plan.sixteenth % 2 === 1) return 0;
  let level = HAT_ROW[plan.sixteenth] ?? 0;
  level *= 0.88 + ((step * 17) % 7) * 0.03;
  if (plan.section === 'B' && plan.sixteenth % 2 === 1) level *= 1.18;
  if (plan.fill && plan.sixteenth >= 12) level *= 0.45;
  if (plan.intro) level *= 0.9;
  if (mode === 'menu') level *= 0.7;
  if (level < 0.12) return 0;
  return level;
}

export function kitHits(step: number, mode: BedMode): KitHits {
  const plan = planStep(step);
  const s = plan.sixteenth;
  return {
    kick: kickSixteenths(plan, mode).includes(s),
    snare: snareSixteenths(plan, mode).includes(s),
    openHat: mode === 'play' && plan.section === 'B' && !plan.fill && s === 14,
  };
}

export function bassEvent(step: number, mode: BedMode): BassEvent | null {
  const plan = planStep(step);
  if (!bassSixteenths(plan, mode).includes(plan.sixteenth)) return null;
  const chord = chordAt(plan, mode);
  let freq = chord.bass;
  if (plan.sixteenth === 6) freq = chord.bass * 1.122;
  else if (plan.sixteenth === 8 || plan.sixteenth === 11) freq = chord.fifth;
  const durSteps = plan.sixteenth === 0 ? (mode === 'menu' ? 14 : 7) : 3;
  return { freq, durSteps };
}

/** Rhodes-style voicing for this bar, or null when the bar does not start a chord. */
export function chordNotes(step: number, mode: BedMode): readonly number[] | null {
  const plan = planStep(step);
  if (plan.sixteenth !== 0) return null;
  const chord = chordAt(plan, mode);
  const voiced = plan.section === 'B' ? chord.color : chord.notes;
  if (mode === 'menu') return [voiced[0], voiced[voiced.length - 1]];
  return voiced;
}

export function chordHoldSteps(step: number, mode: BedMode): number {
  const plan = planStep(step);
  if (plan.intro) return 4;
  if (plan.fill) return 3;
  return mode === 'menu' ? 4 : 2;
}

function chordAt(plan: StepPlan, mode: BedMode): Chord {
  const list = mode === 'play' ? PLAY_CHORDS : MENU_CHORDS;
  const index = plan.intro ? 0 : ((plan.loopBar % 4) + 4) % 4;
  return list[index] ?? list[0];
}

function kickSixteenths(plan: StepPlan, mode: BedMode): readonly number[] {
  switch (plan.section) {
    case 'intro':
      if (plan.bar === 0 || mode === 'menu') return [];
      return [0];
    case 'A':
      if (plan.fill) return [0];
      return mode === 'play' ? [0, 10] : [0];
    case 'B':
      if (plan.fill) return [0];
      return mode === 'play' ? [0, 6, 11] : [0, 8];
    default: {
      const exhaustive: never = plan.section;
      return exhaustive;
    }
  }
}

function snareSixteenths(plan: StepPlan, mode: BedMode): readonly number[] {
  switch (plan.section) {
    case 'intro':
      if (plan.bar === 0 || mode === 'menu') return [];
      return [12];
    case 'A':
    case 'B':
      if (plan.fill) return mode === 'play' ? [4, 12, 13, 14, 15] : [12, 13, 14, 15];
      return [4, 12];
    default: {
      const exhaustive: never = plan.section;
      return exhaustive;
    }
  }
}

function bassSixteenths(plan: StepPlan, mode: BedMode): readonly number[] {
  if (plan.bar === 0) return [];
  if (mode === 'menu') return [0];
  switch (plan.section) {
    case 'intro':
      return [0];
    case 'A':
      return plan.fill ? [0] : [0, 8];
    case 'B':
      return plan.fill ? [0] : [0, 6, 11];
    default: {
      const exhaustive: never = plan.section;
      return exhaustive;
    }
  }
}

function makeNoise(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = (state / 4294967296) * 2 - 1;
  }
  return buffer;
}

function shapeCrackle(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  let state = 0x51a7;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  let env = 0;
  for (let i = 0; i < data.length; i++) {
    if (next() > 0.9975) env = 0.45 + next();
    env *= 0.9;
    data[i] = data[i] * 0.04 + data[i] * env;
  }
}

function pulse(ctx: BaseAudioContext, at: number, peak: number, attack: number, dur: number): GainNode {
  const gain = ctx.createGain();
  const top = Math.max(0.0001, peak);
  const end = Math.max(attack + 0.012, dur);
  if (attack <= 0.001) gain.gain.setValueAtTime(top, at);
  else {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(top, at + attack);
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, at + end);
  return gain;
}

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const norm = Math.tanh(amount);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / norm;
  }
  return curve;
}

/** Duck the bed under the kick so the loop pumps without swallowing the snare. */
function duckPump(graph: MusicGraph, at: number) {
  const gain = graph.pump.gain;
  gain.cancelScheduledValues(at);
  gain.setValueAtTime(1, at);
  gain.linearRampToValueAtTime(0.3, at + 0.012);
  gain.exponentialRampToValueAtTime(1, at + 0.2);
}

function wireReverb(ctx: BaseAudioContext, send: GainNode, mix: GainNode) {
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 3200;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const taps: ReadonlyArray<readonly [number, number]> = [
    [0.061, 0.55],
    [0.104, 0.32],
    [0.153, 0.16],
  ];
  for (const [time, amount] of taps) {
    const delay = ctx.createDelay(0.25);
    delay.delayTime.value = time;
    const gain = ctx.createGain();
    gain.gain.value = amount;
    send.connect(delay).connect(gain).connect(low);
  }
  low.connect(wet).connect(mix);
}

export function createMusicGraph(ctx: BaseAudioContext): MusicGraph {
  const mix = ctx.createGain();
  mix.gain.value = 1;

  const pump = ctx.createGain();
  pump.gain.value = 1;
  pump.connect(mix);

  const bassDuck = ctx.createGain();
  bassDuck.gain.value = 1;
  const bassDrive = ctx.createWaveShaper();
  bassDrive.curve = driveCurve(8);
  bassDrive.oversample = '2x';
  const bassLow = ctx.createBiquadFilter();
  bassLow.type = 'lowpass';
  bassLow.frequency.value = 340;
  bassLow.Q.value = 0.7;
  bassDuck.connect(bassDrive).connect(bassLow).connect(pump);

  const kickBus = ctx.createGain();
  kickBus.gain.value = 1.15;
  const kickDrive = ctx.createWaveShaper();
  kickDrive.curve = driveCurve(2.6);
  kickDrive.oversample = '2x';
  kickBus.connect(kickDrive).connect(mix);

  const kickClick = ctx.createBiquadFilter();
  kickClick.type = 'highpass';
  kickClick.frequency.value = 2400;
  kickClick.Q.value = 0.7;
  kickClick.connect(kickBus);

  const snareNoise = ctx.createBiquadFilter();
  snareNoise.type = 'bandpass';
  snareNoise.frequency.value = 1900;
  snareNoise.Q.value = 0.7;
  const snareCrack = ctx.createBiquadFilter();
  snareCrack.type = 'highpass';
  snareCrack.frequency.value = 4800;
  snareCrack.Q.value = 0.6;
  const snareBus = ctx.createGain();
  snareBus.gain.value = 1.15;
  snareNoise.connect(snareBus);
  snareCrack.connect(snareBus);
  const snarePan = ctx.createStereoPanner();
  snarePan.pan.value = -0.12;
  snareBus.connect(snarePan).connect(mix);
  const snareSend = ctx.createGain();
  snareSend.gain.value = 0.28;
  snareBus.connect(snareSend);
  wireReverb(ctx, snareSend, mix);

  const closedHat = ctx.createBiquadFilter();
  closedHat.type = 'highpass';
  closedHat.frequency.value = 7600;
  const openHat = ctx.createBiquadFilter();
  openHat.type = 'highpass';
  openHat.frequency.value = 4600;
  const hatBus = ctx.createGain();
  hatBus.gain.value = 0.82;
  closedHat.connect(hatBus);
  openHat.connect(hatBus);
  const hatPan = ctx.createStereoPanner();
  hatPan.pan.value = 0.28;
  hatBus.connect(hatPan).connect(pump);

  const chordIn = ctx.createBiquadFilter();
  chordIn.type = 'bandpass';
  chordIn.frequency.value = 720;
  chordIn.Q.value = 1.8;
  chordIn.connect(pump);

  const crackle = makeNoise(ctx, 2, 0xa11ce);
  shapeCrackle(crackle);
  const vinyl = ctx.createBufferSource();
  vinyl.buffer = crackle;
  vinyl.loop = true;
  const vinylHigh = ctx.createBiquadFilter();
  vinylHigh.type = 'highpass';
  vinylHigh.frequency.value = 1600;
  const vinylGain = ctx.createGain();
  vinylGain.gain.value = 0.045;
  vinyl.connect(vinylHigh).connect(vinylGain).connect(pump);
  vinyl.start(ctx instanceof AudioContext ? ctx.currentTime : 0);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 6;
  comp.ratio.value = 3;
  comp.attack.value = 0.018;
  comp.release.value = 0.14;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -2;
  limit.knee.value = 0;
  limit.ratio.value = 12;
  limit.attack.value = 0.002;
  limit.release.value = 0.06;
  mix.connect(comp).connect(limit);

  const out = ctx.createGain();
  out.gain.value = 1;
  limit.connect(out);

  return {
    ctx,
    out,
    mix,
    bassDuck,
    pump,
    noise: makeNoise(ctx, 1, 0xc0ffee),
    kickBus,
    kickClick,
    snareNoise,
    snareCrack,
    snareBus,
    closedHat,
    openHat,
    chordIn,
  };
}

function playNoise(graph: MusicGraph, at: number, dur: number, peak: number, dest: AudioNode, offset = 0) {
  const src = graph.ctx.createBufferSource();
  src.buffer = graph.noise;
  const gain = pulse(graph.ctx, at, peak, 0, dur);
  src.connect(gain).connect(dest);
  src.start(at, offset % 0.85);
  src.stop(at + dur + 0.03);
}

function playTone(
  graph: MusicGraph,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  dest: AudioNode,
  slideTo?: number,
) {
  if (freq <= 0 || peak <= 0) return;
  const osc = graph.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo && slideTo > 0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), at + Math.min(0.08, dur * 0.5));
  const gain = pulse(graph.ctx, at, peak, type === 'sine' ? 0.006 : 0.001, dur);
  osc.connect(gain).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.04);
}

function playKick(graph: MusicGraph, at: number, vel: number) {
  playNoise(graph, at, 0.008, 0.72 * vel, graph.kickClick);
  playTone(graph, at, 186, 0.055, 'sine', 0.9 * vel, graph.kickBus, 62);
  playTone(graph, at, 92, 0.16, 'sine', 0.78 * vel, graph.kickBus, 46);
  playTone(graph, at, 52, 0.22, 'triangle', 0.42 * vel, graph.kickBus, 36);
  duckPump(graph, at);
}

function playSnare(graph: MusicGraph, at: number, vel: number) {
  playNoise(graph, at, 0.05, 0.62 * vel, graph.snareNoise);
  playNoise(graph, at, 0.016, 0.95 * vel, graph.snareCrack);
  playNoise(graph, at + 0.012, 0.03, 0.28 * vel, graph.snareNoise);
  playTone(graph, at, 218, 0.04, 'triangle', 0.34 * vel, graph.snareBus);
  playTone(graph, at, 164, 0.028, 'square', 0.07 * vel, graph.snareBus);
}

function playHat(graph: MusicGraph, at: number, level: number, open: boolean) {
  const dest = open ? graph.openHat : graph.closedHat;
  const offset = (Math.round(at * 17) % 8) * 0.09;
  playNoise(graph, at, open ? 0.05 : 0.014, (open ? 0.2 : 0.16) * level, dest, offset);
}

function play808(graph: MusicGraph, at: number, freq: number, dur: number, vel: number) {
  const length = Math.min(0.55, Math.max(0.12, dur));
  playTone(graph, at, freq * 2, length, 'sine', 0.62 * vel, graph.bassDuck, freq);
  playTone(graph, at, freq, Math.min(0.22, length), 'sawtooth', 0.2 * vel, graph.bassDuck, freq * 0.5);
}

/** Short dark chop: the shared bandpass falls, closer to a muted brass hit than a pad. */
function playChord(graph: MusicGraph, at: number, notes: readonly number[], dur: number, vel: number) {
  const length = Math.min(0.18, Math.max(0.08, dur));
  const filter = graph.chordIn.frequency;
  filter.cancelScheduledValues(at);
  filter.setValueAtTime(1280, at);
  filter.exponentialRampToValueAtTime(460, at + length);
  playNoise(graph, at, 0.02, 0.08 * vel, graph.chordIn);
  for (const freq of notes) {
    playTone(graph, at, freq, length, 'sawtooth', 0.11 * vel, graph.chordIn, freq * 0.94);
    playTone(graph, at, freq * 1.003, length * 0.7, 'triangle', 0.04 * vel, graph.chordIn);
  }
}

function kickVelocity(plan: StepPlan, mode: BedMode): number {
  let vel = plan.intro ? 0.72 : 1;
  if (plan.section === 'B') vel *= 1.04;
  if (mode === 'menu') vel *= 0.9;
  return vel;
}

function snareVelocity(plan: StepPlan, mode: BedMode): number {
  let vel = 0.9;
  if (plan.fill) {
    if (plan.sixteenth >= 15) vel = 1.15;
    else if (plan.sixteenth >= 14) vel = 0.98;
    else if (plan.sixteenth >= 13) vel = 0.82;
    else if (plan.sixteenth >= 12) vel = 0.7;
    else vel = 0.72;
  }
  if (plan.intro) vel *= 0.7;
  if (mode === 'menu') vel *= 0.82;
  return vel;
}

function chordVelocity(plan: StepPlan, mode: BedMode): number {
  let vel = plan.section === 'B' ? 0.95 : 0.8;
  if (plan.bar === 0) vel = 0.34;
  else if (plan.intro) vel = 0.55;
  if (plan.fill) vel *= 0.75;
  if (mode === 'menu') vel *= 0.72;
  return vel;
}

export function scheduleMusicStep(
  graph: MusicGraph,
  mode: BedMode,
  step: number,
  at: number,
  stepLength: number,
) {
  const plan = planStep(step);
  const hits = kitHits(step, mode);
  if (hits.kick) playKick(graph, at, kickVelocity(plan, mode));
  if (hits.snare) playSnare(graph, at, snareVelocity(plan, mode));
  const hat = hatLevel(step, mode);
  if (hat > 0) playHat(graph, at, hat, hits.openHat);
  const bass = bassEvent(step, mode);
  if (bass) play808(graph, at, bass.freq, Math.max(0.08, bass.durSteps * stepLength), mode === 'menu' ? 0.78 : 1);
  const notes = chordNotes(step, mode);
  if (notes) playChord(graph, at, notes, chordHoldSteps(step, mode) * stepLength, chordVelocity(plan, mode));
  else if (chopStep(plan, mode)) {
    const root = chordAt(plan, mode).notes[0];
    if (root) playChord(graph, at, [root, root * 1.189], 0.11, mode === 'menu' ? 0.4 : 0.62);
  }
}

/** One swung minor chop per bar, off the kick, so the stab pattern stays sparse. */
function chopStep(plan: StepPlan, mode: BedMode): boolean {
  if (plan.intro || plan.fill) return false;
  switch (plan.section) {
    case 'intro':
      return false;
    case 'A':
      return mode === 'play' && plan.sixteenth === 7;
    case 'B':
      return plan.sixteenth === (mode === 'play' ? 9 : 7);
    default: {
      const exhaustive: never = plan.section;
      return exhaustive;
    }
  }
}

/** Short chord stab on the SFX bus, so a milestone still cuts over the bed. */
export function playCheerStab(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  bus: GainNode,
  at: number,
  big: boolean,
) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.7;
  filter.connect(bus);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const noiseGain = pulse(ctx, at, big ? 0.16 : 0.1, 0, big ? 0.12 : 0.08);
  src.connect(noiseGain).connect(filter);
  src.start(at);
  src.stop(at + 0.16);
  const root = big ? 392 : 440;
  const tone = ctx.createOscillator();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(root, at);
  const toneGain = pulse(ctx, at, big ? 0.1 : 0.07, 0.004, big ? 0.2 : 0.14);
  tone.connect(toneGain).connect(bus);
  tone.start(at);
  tone.stop(at + 0.24);
  const fifth = ctx.createOscillator();
  fifth.type = 'sine';
  fifth.frequency.setValueAtTime(root * 1.5, at + 0.04);
  const fifthGain = pulse(ctx, at + 0.04, big ? 0.07 : 0.045, 0.004, 0.16);
  fifth.connect(fifthGain).connect(bus);
  fifth.start(at + 0.04);
  fifth.stop(at + 0.24);
}

/** Scratch plus a filtered stab. Lands on the music bus at streak milestones. */
export function playScratch(graph: MusicGraph, at: number) {
  const ctx = graph.ctx;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(420, at);
  filter.frequency.exponentialRampToValueAtTime(3000, at + 0.08);
  filter.frequency.exponentialRampToValueAtTime(680, at + 0.18);
  filter.connect(graph.mix);
  playNoise(graph, at, 0.18, 0.22, filter);
  playChord(graph, at, [349.23, 415.3, 523.25], 0.16, 0.85);
}

export async function renderMusicTake(mode: BedMode, seconds: number): Promise<AudioBuffer> {
  const Offline = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
  if (!Offline) throw new Error('OfflineAudioContext is not available');
  const sampleRate = 44100;
  const length = Math.max(1, Math.ceil(sampleRate * seconds));
  const ctx = new Offline(2, length, sampleRate);
  const graph = createMusicGraph(ctx);
  const level = ctx.createGain();
  level.gain.value = mode === 'play' ? MUSIC_PLAY_LEVEL : MUSIC_MENU_LEVEL;
  graph.out.connect(level).connect(ctx.destination);
  const bpm = mode === 'play' ? GAMEPLAY_BPM : MENU_BPM;
  const stepLength = 60 / bpm / 4;
  const origin = 0.06;
  let step = 0;
  while (origin + step * stepLength < seconds - 0.05) {
    const at = origin + step * stepLength + swingDelay(step, stepLength, mode);
    scheduleMusicStep(graph, mode, step, at, stepLength);
    step += 1;
  }
  if (mode === 'play') playScratch(graph, 12);
  return ctx.startRendering();
}

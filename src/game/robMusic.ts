/** Rob's songs. The generated bed in musicBed.ts plays only when these fail to load. */

export const ROB_INSTRUMENTAL_NAME = 'gameplay-instrumental';
export const ROB_MENU_NAME = 'menu-song';

/** Main song loop. The first pass may start at 0 so the opening is heard once. */
export const LOOP_START_SEC = 0.6;
export const LOOP_END_SEC = 146;
/** Inside the requested 1.5–2s loop crossfade. */
export const LOOP_FADE_SEC = 1.75;

/** One-shot gameplay instrumental hands off to the main song. */
export const INSTRUMENTAL_HANDOFF_SEC = 145.5;
export const INSTRUMENTAL_FADE_SEC = 2.5;

/** Menu ↔ play. Same family as the loop crossfade. */
export const MODE_CROSSFADE_SEC = 1.8;

export interface SongLoop {
  start: number;
  end: number;
  fade: number;
}

export interface InstrumentalHandoff {
  at: number;
  fade: number;
}

export interface RobStems {
  instrumental: AudioBuffer;
  menu: AudioBuffer;
}

export function songLoop(duration: number): SongLoop {
  const end = Math.min(LOOP_END_SEC, Math.max(0, duration));
  const room = end - LOOP_START_SEC;
  if (!(room > 2)) return { start: 0, end, fade: 0 };
  return { start: LOOP_START_SEC, end, fade: Math.min(LOOP_FADE_SEC, room / 3) };
}

export function instrumentalHandoff(duration: number): InstrumentalHandoff {
  if (duration >= INSTRUMENTAL_HANDOFF_SEC + 0.05) {
    return { at: INSTRUMENTAL_HANDOFF_SEC, fade: INSTRUMENTAL_FADE_SEC };
  }
  const fade = Math.min(INSTRUMENTAL_FADE_SEC, Math.max(0, duration));
  return { at: Math.max(0, duration - fade), fade };
}

/** When the next loop copy should start so the crossfade finishes at `end`. */
export function nextLoopAt(voiceStart: number, playFor: number, fade: number): number {
  if (!(fade > 0) || !(playFor > fade)) return 0;
  return voiceStart + playFor - fade;
}

function stemUrls(base: string, name: string): readonly string[] {
  const root = base.endsWith('/') ? base : `${base}/`;
  return [`${root}${name}.m4a`, `${root}${name}.ogg`];
}

async function loadFirstBuffer(
  ctx: BaseAudioContext,
  urls: readonly string[],
  fetchImpl: typeof fetch,
): Promise<AudioBuffer | null> {
  for (const url of urls) {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) continue;
      const bytes = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      if (buffer.duration > 0) return buffer;
    } catch {
      /* try the ogg fallback, or the generated bed if both formats fail */
    }
  }
  return null;
}

export async function loadRobStems(
  ctx: BaseAudioContext,
  options?: { base?: string; fetchImpl?: typeof fetch },
): Promise<RobStems | null> {
  const base = options?.base ?? `${import.meta.env.BASE_URL}audio/rob/`;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const instrumental = await loadFirstBuffer(ctx, stemUrls(base, ROB_INSTRUMENTAL_NAME), fetchImpl);
  const menu = await loadFirstBuffer(ctx, stemUrls(base, ROB_MENU_NAME), fetchImpl);
  if (!instrumental || !menu) return null;
  return { instrumental, menu };
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopAt: number;
}

type BedMode = 'menu' | 'play';

export type PlaybackSection = 'menu' | 'instrumental' | 'song';

/** Where playback should start after a mode change or an interruption. */
export function playbackSection(mode: BedMode, handedOff: boolean, force: boolean): PlaybackSection {
  if (mode === 'menu') return 'menu';
  if (force && handedOff) return 'song';
  return 'instrumental';
}

/**
 * Plays the instrumental once per run, then the looping main song.
 * Menu playback is that same loop. Mode changes crossfade.
 */
export class RobPlayer {
  private mode: BedMode | null = null;
  private generation = 0;
  private voices: Voice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private handoffAt = 0;
  private handoffFade = 0;
  private nextAt = 0;
  private loop: SongLoop | null = null;
  /** True once this run has left the one-shot instrumental for the main song. */
  private handedOff = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly stems: RobStems,
    private readonly destination: AudioNode,
  ) {}

  setMode(mode: BedMode, force = false) {
    const live = this.voices.some((voice) => voice.stopAt > this.ctx.currentTime + 0.05);
    if (!force && this.mode === mode && live) return;
    const section = playbackSection(mode, this.handedOff, force && this.mode === mode);
    this.mode = mode;
    this.generation += 1;
    this.fadeOutAll(MODE_CROSSFADE_SEC);
    const when = this.ctx.currentTime;
    if (section === 'instrumental') this.beginInstrumental(when, MODE_CROSSFADE_SEC);
    else this.beginMenu(when, MODE_CROSSFADE_SEC);
    this.ensureTicker();
  }

  /** After an iOS interruption, pick the current section back up if the buffers died. */
  resume() {
    if (!this.mode) return;
    this.setMode(this.mode, true);
  }

  stop() {
    this.mode = null;
    this.handedOff = false;
    this.generation += 1;
    this.fadeOutAll(0.35);
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  private ensureTicker() {
    if (this.timer != null) return;
    this.timer = setInterval(() => this.tick(), 100);
  }

  private tick() {
    const generation = this.generation;
    const now = this.ctx.currentTime;
    if (this.handoffAt > 0 && now + 0.45 >= this.handoffAt) {
      const at = this.handoffAt;
      const fade = this.handoffFade;
      this.handoffAt = 0;
      if (generation !== this.generation) return;
      this.beginMenu(Math.max(at, now), fade);
      return;
    }
    if (this.nextAt > 0 && this.loop && now + 0.45 >= this.nextAt) {
      const at = this.nextAt;
      this.nextAt = 0;
      if (generation !== this.generation) return;
      this.beginLoop(Math.max(at, this.ctx.currentTime));
    }
  }

  private beginInstrumental(when: number, fadeIn: number) {
    this.handedOff = false;
    const buffer = this.stems.instrumental;
    const handoff = instrumentalHandoff(buffer.duration);
    const playFor = Math.max(0.05, Math.min(buffer.duration, handoff.at + handoff.fade));
    this.loop = null;
    this.nextAt = 0;
    this.handoffFade = handoff.fade;
    this.handoffAt = when + handoff.at;
    this.startVoice(buffer, when, 0, playFor, fadeIn, handoff.fade);
  }

  private beginMenu(when: number, fadeIn: number) {
    this.handedOff = this.mode === 'play';
    const loop = songLoop(this.stems.menu.duration);
    this.loop = loop.fade > 0 ? loop : null;
    this.handoffAt = 0;
    const playFor = Math.max(0.05, loop.end);
    this.startVoice(this.stems.menu, when, 0, playFor, fadeIn, loop.fade);
    this.nextAt = nextLoopAt(when, playFor, loop.fade);
  }

  private beginLoop(when: number) {
    const loop = this.loop;
    if (!loop || !(loop.fade > 0)) return;
    const playFor = loop.end - loop.start;
    this.startVoice(this.stems.menu, when, loop.start, playFor, loop.fade, loop.fade);
    this.nextAt = nextLoopAt(when, playFor, loop.fade);
  }

  private startVoice(
    buffer: AudioBuffer,
    when: number,
    offset: number,
    playFor: number,
    fadeIn: number,
    fadeOut: number,
  ) {
    const available = Math.max(0, buffer.duration - offset);
    const duration = Math.min(Math.max(0.05, playFor), available);
    if (!(duration > 0)) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    const start = Math.max(when, this.ctx.currentTime);
    const end = start + duration;
    const fadeInSec = Math.max(0, Math.min(fadeIn, duration / 2));
    const fadeOutSec = Math.max(0, Math.min(fadeOut, duration / 2));
    gain.gain.setValueAtTime(fadeInSec > 0 ? 0.0001 : 1, start);
    if (fadeInSec > 0) gain.gain.linearRampToValueAtTime(1, start + fadeInSec);
    if (fadeOutSec > 0) {
      const down = Math.max(start + fadeInSec, end - fadeOutSec);
      gain.gain.setValueAtTime(1, down);
      gain.gain.linearRampToValueAtTime(0.0001, end);
    }
    source.connect(gain).connect(this.destination);
    source.start(start, Math.max(0, offset), duration);
    try { source.stop(end + 0.03); } catch { /* already scheduled */ }
    const voice: Voice = { source, gain, stopAt: end };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter((item) => item !== voice);
    };
  }

  private fadeOutAll(seconds: number) {
    const now = this.ctx.currentTime;
    const fade = Math.max(0.05, seconds);
    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
        voice.source.stop(now + fade + 0.05);
      } catch {
        /* the buffer already ended */
      }
    }
    this.voices = [];
    this.loop = null;
    this.handoffAt = 0;
    this.nextAt = 0;
  }
}

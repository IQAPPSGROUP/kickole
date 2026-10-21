/** Rob's songs. The generated bed in musicBed.ts plays only when these fail to load. */

export const ROB_INSTRUMENTAL_NAME = 'gameplay-instrumental';
export const ROB_MENU_NAME = 'menu-song';
export const ROB_GAME_SONG_2 = 'game-song-2';
export const ROB_GAME_SONG_3 = 'game-song-3';

/** Gameplay rotation. Missing files are skipped. */
export const GAMEPLAY_TRACKS: readonly string[] = [
  ROB_INSTRUMENTAL_NAME,
  ROB_MENU_NAME,
  ROB_GAME_SONG_2,
  ROB_GAME_SONG_3,
];

/** Main song loop. The first pass may start at 0 so the opening is heard once. */
export const LOOP_START_SEC = 0.6;
export const LOOP_END_SEC = 146;
/** Inside the requested 1.5–2s loop crossfade. */
export const LOOP_FADE_SEC = 1.75;

/** Playlist tracks skip this much of the file so the lead-in is not heard. */
export const TRACK_LEAD_IN_SEC = 0.6;
/** Overlap between playlist tracks. */
export const TRACK_CROSSFADE_SEC = 2.5;
/** Start the next playlist track this long before the current file ends. */
export const TRACK_HANDOFF_BEFORE_END_SEC = 3.5;

/** Menu ↔ play. */
export const MODE_CROSSFADE_SEC = 1.8;

/** Decode the next playlist track this early so the crossfade is not late. */
const PREFETCH_SEC = 8;

export interface SongLoop {
  start: number;
  end: number;
  fade: number;
}

export interface TrackWindow {
  /** File position where this copy starts. */
  offset: number;
  /** File position where the next track starts. */
  handoff: number;
  fade: number;
}

export type ResumePlan =
  | { action: 'resume'; offset: number }
  | { action: 'advance' };

type BedMode = 'menu' | 'play';

export function songLoop(duration: number): SongLoop {
  const end = Math.min(LOOP_END_SEC, Math.max(0, duration));
  const room = end - LOOP_START_SEC;
  if (!(room > 2)) return { start: 0, end, fade: 0 };
  return { start: LOOP_START_SEC, end, fade: Math.min(LOOP_FADE_SEC, room / 3) };
}

/** When the next loop copy should start so the crossfade finishes at `end`. */
export function nextLoopAt(voiceStart: number, playFor: number, fade: number): number {
  if (!(fade > 0) || !(playFor > fade)) return 0;
  return voiceStart + playFor - fade;
}

/**
 * Playlist window. A resumed offset keeps the place in the file.
 * The next track begins 3.5s before the file ends, fading for 2.5s.
 */
export function trackWindow(duration: number, resumeOffset?: number): TrackWindow {
  const lead = Math.min(TRACK_LEAD_IN_SEC, Math.max(0, duration));
  const offset = resumeOffset == null
    ? lead
    : Math.min(Math.max(0, duration), Math.max(lead, resumeOffset));
  const handoff = Math.min(duration, Math.max(offset, duration - TRACK_HANDOFF_BEFORE_END_SEC));
  const tail = Math.max(0, duration - handoff);
  const fade = Math.min(TRACK_CROSSFADE_SEC, tail > 0 ? tail : Math.max(0, duration - offset));
  return { offset, handoff, fade };
}

/** Continue a run from the saved file position, or advance when that track is in its ending. */
export function resumePlan(duration: number, savedOffset: number): ResumePlan {
  const window = trackWindow(duration);
  if (!(duration > window.offset) || savedOffset >= window.handoff) return { action: 'advance' };
  return { action: 'resume', offset: Math.min(duration, Math.max(window.offset, savedOffset)) };
}

/** Fisher-Yates. The session keeps this order so runs do not restart at track one. */
export function shuffleNames(names: readonly string[], random: () => number = Math.random): string[] {
  const order = names.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
}

export interface TrackPick {
  name: string;
  index: number;
}

/**
 * Next playlist entry. Failed names are skipped.
 * The track that just played is skipped too when another one is available.
 */
export function pickTrack(
  order: readonly string[],
  startIndex: number,
  failed: ReadonlySet<string>,
  previous: string | null,
): TrackPick | null {
  if (!order.length) return null;
  const available = order.filter((name) => !failed.has(name));
  if (!available.length) return null;
  const length = order.length;
  const start = ((startIndex % length) + length) % length;
  for (let step = 0; step < length; step++) {
    const index = (start + step) % length;
    const name = order[index];
    if (failed.has(name)) continue;
    if (previous && name === previous && available.length > 1) continue;
    return { name, index };
  }
  return { name: available[0], index: order.indexOf(available[0]) };
}

function stemUrls(base: string, name: string): readonly string[] {
  const root = base.endsWith('/') ? base : `${base}/`;
  return [`${root}${name}.m4a`, `${root}${name}.ogg`];
}

function looksLikeHtml(type: string, bytes: ArrayBuffer): boolean {
  if (type.toLowerCase().includes('text/html')) return true;
  const head = new TextDecoder().decode(bytes.slice(0, 24)).trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
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
      const type = response.headers.get('content-type') ?? '';
      const bytes = await response.arrayBuffer();
      if (looksLikeHtml(type, bytes)) continue;
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      if (buffer.duration > 0) return buffer;
    } catch {
      /* try the ogg fallback, then the next playlist track */
    }
  }
  return null;
}

/** Fetch one song. `.m4a` first, then `.ogg`. HTML shells and decode errors are misses. */
export async function loadTrack(
  ctx: BaseAudioContext,
  name: string,
  options?: { base?: string; fetchImpl?: typeof fetch },
): Promise<AudioBuffer | null> {
  const base = options?.base ?? `${import.meta.env.BASE_URL}audio/rob/`;
  const fetchImpl = options?.fetchImpl ?? fetch;
  return loadFirstBuffer(ctx, stemUrls(base, name), fetchImpl);
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopAt: number;
  role: BedMode;
  track: string;
  fileStart: number;
  startedAt: number;
}

interface Playhead {
  name: string;
  offset: number;
}

/**
 * Menu loops menu-song. Gameplay rotates a shuffled playlist for the whole
 * page session and only decodes the track that is playing, plus the next one
 * just before the crossfade.
 */
export class RobPlayer {
  private mode: BedMode | null = null;
  private generation = 0;
  private pending: BedMode | null = null;
  private voices: Voice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private handoffAt = 0;
  private handoffFade = 0;
  private prefetchAt = 0;
  private prefetchName: string | null = null;
  private prefetch: Promise<AudioBuffer | null> | null = null;
  private nextAt = 0;
  private loop: SongLoop | null = null;
  private menuBuffer: AudioBuffer | null = null;
  private cache: { name: string; buffer: AudioBuffer } | null = null;
  private order: string[] | null = null;
  private cursor = 0;
  private failed = new Set<string>();
  private playhead: Playhead | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly onResult: (mode: BedMode, ok: boolean) => void = () => {},
    private readonly load: (name: string) => Promise<AudioBuffer | null> = (name) => loadTrack(ctx, name),
  ) {}

  setMode(mode: BedMode, force = false) {
    const live = this.voices.some((voice) => voice.stopAt > this.ctx.currentTime + 0.05);
    if (!force && this.mode === mode && (live || this.pending === mode)) return;
    if (this.mode === 'play') this.capturePlayhead();
    this.generation += 1;
    const generation = this.generation;
    this.mode = mode;
    this.pending = mode;
    this.fadeOutAll(MODE_CROSSFADE_SEC);
    this.ensureTicker();
    void this.activate(mode, generation);
  }

  /** After an iOS interruption, pick the current mode back up from the saved place. */
  resume() {
    if (!this.mode) return;
    this.setMode(this.mode, true);
  }

  stop() {
    if (this.mode == null && this.pending == null && this.voices.length === 0) return;
    if (this.mode === 'play') this.capturePlayhead();
    this.mode = null;
    this.pending = null;
    this.generation += 1;
    this.fadeOutAll(0.35);
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  private async activate(mode: BedMode, generation: number) {
    const ok = mode === 'menu'
      ? await this.startMenu(generation)
      : await this.startPlay(generation);
    if (generation !== this.generation) return;
    if (this.pending === mode) this.pending = null;
    this.onResult(mode, ok);
  }

  private async startMenu(generation: number): Promise<boolean> {
    const ready = this.menuBuffer ?? (this.cache?.name === ROB_MENU_NAME ? this.cache.buffer : null);
    const buffer = ready ?? await this.load(ROB_MENU_NAME);
    if (generation !== this.generation || this.mode !== 'menu') return false;
    if (!buffer) return false;
    this.menuBuffer = buffer;
    this.beginMenu(this.ctx.currentTime, MODE_CROSSFADE_SEC);
    if (this.cache && this.cache.buffer !== buffer) this.cache = null;
    return true;
  }

  private async startPlay(generation: number): Promise<boolean> {
    if (!this.order) this.order = shuffleNames(GAMEPLAY_TRACKS);
    const saved = this.playhead;
    if (saved && !this.failed.has(saved.name)) {
      const buffer = await this.song(saved.name, generation);
      if (generation !== this.generation || this.mode !== 'play') return false;
      if (buffer) {
        const plan = resumePlan(buffer.duration, saved.offset);
        if (plan.action === 'resume') {
          this.cursor = Math.max(0, this.order.indexOf(saved.name));
          this.spawnTrack(buffer, saved.name, plan.offset, this.ctx.currentTime, MODE_CROSSFADE_SEC);
          this.releaseMenu();
          return true;
        }
        this.cursor = (Math.max(0, this.order.indexOf(saved.name)) + 1) % this.order.length;
      } else {
        this.failed.add(saved.name);
        this.cursor = (Math.max(0, this.order.indexOf(saved.name)) + 1) % this.order.length;
      }
      this.playhead = null;
    }
    const previous = saved?.name ?? null;
    const next = await this.takeNext(this.cursor, previous, generation);
    if (generation !== this.generation || this.mode !== 'play' || !next) return false;
    this.cursor = next.index;
    this.spawnTrack(next.buffer, next.name, trackWindow(next.buffer.duration).offset, this.ctx.currentTime, MODE_CROSSFADE_SEC);
    this.releaseMenu();
    return true;
  }

  private async takeNext(startIndex: number, previous: string | null, generation: number) {
    const order = this.order ?? [];
    const tried = new Set<string>();
    let index = startIndex;
    let prior = previous;
    while (tried.size < order.length) {
      const pick = pickTrack(order, index, this.failed, prior);
      if (!pick || tried.has(pick.name)) return null;
      tried.add(pick.name);
      const buffer = await this.song(pick.name, generation);
      if (generation !== this.generation) return null;
      if (buffer && buffer.duration > TRACK_LEAD_IN_SEC + 0.05) return { ...pick, buffer };
      this.failed.add(pick.name);
      index = pick.index + 1;
      prior = null;
    }
    return null;
  }

  private async song(name: string, generation: number): Promise<AudioBuffer | null> {
    if (this.cache?.name === name) return this.cache.buffer;
    if (name === ROB_MENU_NAME && this.menuBuffer) return this.menuBuffer;
    const buffer = await this.load(name);
    if (!buffer || generation !== this.generation) return null;
    this.cache = { name, buffer };
    return buffer;
  }

  private releaseMenu() {
    this.menuBuffer = null;
  }

  private ensureTicker() {
    if (this.timer != null) return;
    this.timer = setInterval(() => this.tick(), 100);
  }

  private tick() {
    const generation = this.generation;
    const now = this.ctx.currentTime;
    this.capturePlayhead();
    if (this.prefetchAt > 0 && this.prefetchName && now + 0.2 >= this.prefetchAt) {
      const name = this.prefetchName;
      this.prefetchAt = 0;
      if (!this.prefetch) this.prefetch = this.song(name, generation);
    }
    if (this.handoffAt > 0 && this.mode === 'play' && now + 0.45 >= this.handoffAt) {
      const at = this.handoffAt;
      const fade = this.handoffFade;
      this.handoffAt = 0;
      if (generation !== this.generation) return;
      void this.crossfadeNext(Math.max(at, now), fade, generation);
      return;
    }
    if (this.nextAt > 0 && this.loop && this.mode === 'menu' && now + 0.45 >= this.nextAt) {
      const at = this.nextAt;
      this.nextAt = 0;
      if (generation !== this.generation) return;
      this.beginLoop(Math.max(at, this.ctx.currentTime));
    }
  }

  private async crossfadeNext(when: number, fade: number, generation: number) {
    const order = this.order;
    if (!order || this.mode !== 'play') return;
    const previous = this.playhead?.name ?? order[this.cursor] ?? null;
    const loaded = this.prefetch;
    this.prefetch = null;
    this.prefetchName = null;
    let buffer: AudioBuffer | null = null;
    let pick: TrackPick | null = null;
    if (loaded && previous) {
      const hoped = pickTrack(order, this.cursor + 1, this.failed, previous);
      const decoded = await loaded;
      if (generation !== this.generation || this.mode !== 'play') return;
      if (hoped && !decoded) this.failed.add(hoped.name);
      if (hoped && decoded && this.cache?.name === hoped.name) {
        buffer = decoded;
        pick = hoped;
      }
    }
    if (!pick || !buffer) {
      const taken = await this.takeNext(this.cursor + 1, previous, generation);
      if (generation !== this.generation || this.mode !== 'play' || !taken) {
        if (generation === this.generation && this.mode === 'play') this.onResult('play', false);
        return;
      }
      pick = taken;
      buffer = taken.buffer;
    }
    this.cursor = pick.index;
    this.spawnTrack(buffer, pick.name, trackWindow(buffer.duration).offset, when, fade);
  }

  private spawnTrack(buffer: AudioBuffer, name: string, offset: number, when: number, fadeIn: number) {
    const plan = trackWindow(buffer.duration, offset);
    const playFor = Math.max(0.05, Math.min(buffer.duration - plan.offset, plan.handoff + plan.fade - plan.offset));
    this.loop = null;
    this.nextAt = 0;
    this.playhead = { name, offset: plan.offset };
    this.cache = { name, buffer };
    this.startVoice(buffer, when, plan.offset, playFor, fadeIn, plan.fade, 'play', name);
    const started = this.voices[this.voices.length - 1];
    const handoffDelay = Math.max(0, plan.handoff - plan.offset);
    this.handoffFade = plan.fade;
    this.handoffAt = (started?.startedAt ?? when) + handoffDelay;
    const next = pickTrack(this.order ?? [], this.cursor + 1, this.failed, name);
    this.prefetch = null;
    this.prefetchName = next?.name ?? null;
    this.prefetchAt = next ? this.handoffAt - PREFETCH_SEC : 0;
    if (next && this.prefetchAt <= this.ctx.currentTime) {
      this.prefetchAt = 0;
      this.prefetch = this.song(next.name, this.generation);
    }
  }

  private beginMenu(when: number, fadeIn: number) {
    const buffer = this.menuBuffer;
    if (!buffer) return;
    const loop = songLoop(buffer.duration);
    this.loop = loop.fade > 0 ? loop : null;
    this.handoffAt = 0;
    this.prefetchAt = 0;
    const playFor = Math.max(0.05, loop.end);
    this.startVoice(buffer, when, 0, playFor, fadeIn, loop.fade, 'menu', ROB_MENU_NAME);
    this.nextAt = nextLoopAt(when, playFor, loop.fade);
  }

  private beginLoop(when: number) {
    const loop = this.loop;
    const buffer = this.menuBuffer ?? (this.cache?.name === ROB_MENU_NAME ? this.cache.buffer : null);
    if (!loop || !(loop.fade > 0) || !buffer) return;
    const playFor = loop.end - loop.start;
    this.startVoice(buffer, when, loop.start, playFor, loop.fade, loop.fade, 'menu', ROB_MENU_NAME);
    this.nextAt = nextLoopAt(when, playFor, loop.fade);
  }

  private capturePlayhead() {
    const now = this.ctx.currentTime;
    const voice = [...this.voices].reverse().find((item) => item.role === 'play' && item.stopAt > now);
    if (!voice) return;
    const offset = voice.fileStart + Math.max(0, now - voice.startedAt);
    this.playhead = { name: voice.track, offset };
  }

  private startVoice(
    buffer: AudioBuffer,
    when: number,
    offset: number,
    playFor: number,
    fadeIn: number,
    fadeOut: number,
    role: BedMode,
    track: string,
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
    const voice: Voice = { source, gain, stopAt: end, role, track, fileStart: Math.max(0, offset), startedAt: start };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter((item) => item !== voice);
      try { source.buffer = null; } catch { /* the node has already released it */ }
    };
  }

  private fadeOutAll(seconds: number) {
    const now = this.ctx.currentTime;
    const fade = Math.max(0.05, seconds);
    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        const held = voice.gain.gain.value;
        voice.gain.gain.setValueAtTime(held > 0 ? held : 0.0001, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
        voice.source.stop(now + fade + 0.05);
        voice.stopAt = now + fade;
      } catch {
        /* the buffer already ended */
      }
    }
    this.voices = [];
    this.loop = null;
    this.handoffAt = 0;
    this.handoffFade = 0;
    this.prefetchAt = 0;
    this.prefetch = null;
    this.prefetchName = null;
    this.nextAt = 0;
  }
}

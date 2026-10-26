import { GAME_TRACKS, MENU_TRACK_ID, SHUFFLE_SONG, type GameTrackId, type SongChoice } from './tracks';

/** Rob's songs. The generated bed in musicBed.ts plays only when these fail to load. */

export const ROB_MENU_NAME = MENU_TRACK_ID;

/** Gameplay rotation. Missing files are skipped. Titles live in tracks.ts. */
export const GAMEPLAY_TRACKS: readonly string[] = GAME_TRACKS.map((track) => track.id);

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

/**
 * Songs whose files do not use the shared lead-in and ending.
 * Keep It in the Air has no fade-in and an abrupt ending.
 * Don't Let It Drop has no fade-in; the crossfade leaves before the ending.
 */
const TRACK_CUE: Partial<Record<GameTrackId, { leadIn: number; handoffAt: number; fade: number }>> = {
  'game-song-2': { leadIn: 0, handoffAt: 155.5, fade: 2 },
  'game-song-3': { leadIn: 0, handoffAt: 152, fade: 2.5 },
};

function trackLeadIn(name: string): number {
  const cue = TRACK_CUE[name as GameTrackId];
  return cue ? cue.leadIn : TRACK_LEAD_IN_SEC;
}

/** Menu ↔ play. */
export const MODE_CROSSFADE_SEC = 1.8;

/** Decode the next playlist track this early so the crossfade is not late. */
const PREFETCH_SEC = 8;

/** Every shuffle run opens on Alley Beat, then leaves it out of the automatic rotation. */
export const OPENER_TRACK_ID = 'gameplay-instrumental';

/** Songs that follow Alley Beat. Shuffled per run, never back to back. */
export const ROTATION_TRACKS: readonly string[] = ['menu-song', 'game-song-2', 'game-song-3'];

/**
 * Alley Beat first when it is enabled, then a shuffle of We Rise, Keep It in the Air,
 * and Don't Let It Drop. A disabled opener leaves only that shuffle.
 */
export function openingPlaylist(enabled: readonly string[], random: () => number = Math.random): string[] {
  const allow = new Set(enabled);
  const opener = allow.has(OPENER_TRACK_ID) ? [OPENER_TRACK_ID] : [];
  const rest = shuffleNames(ROTATION_TRACKS.filter((id) => allow.has(id)), random);
  return [...opener, ...rest];
}

/**
 * The track that starts when the current one reaches its handoff.
 * Alley Beat plays once per run. The later songs stay in their shuffle and do not repeat back to back.
 * A one-song list is allowed to repeat.
 */
export function nextRotationTrack(
  playlist: readonly string[],
  current: string | null,
  failed: ReadonlySet<string>,
): TrackPick | null {
  const rotation = playlist.filter((name) => name !== OPENER_TRACK_ID);
  const pool = rotation.length > 0 ? rotation : playlist;
  const index = current ? pool.indexOf(current) : -1;
  const start = index >= 0 ? index + 1 : 0;
  const pick = pickTrack(pool, start, failed, current);
  if (!pick) return null;
  const fullIndex = playlist.indexOf(pick.name);
  return { name: pick.name, index: fullIndex >= 0 ? fullIndex : pick.index };
}

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
 * Most tracks begin 0.6s in and hand off 3.5s before the end, fading for 2.5s.
 * A named cue starts at its own lead-in and hands off at a file time.
 */
export function trackWindow(duration: number, resumeOffset?: number, name?: string): TrackWindow {
  const cue = name ? TRACK_CUE[name as GameTrackId] : undefined;
  const cueFits = cue != null && cue.handoffAt < duration - 0.05;
  const lead = Math.min(cue ? cue.leadIn : TRACK_LEAD_IN_SEC, Math.max(0, duration));
  const offset = resumeOffset == null
    ? lead
    : Math.min(Math.max(0, duration), Math.max(lead, resumeOffset));
  const requested = cueFits && cue ? cue.handoffAt : duration - TRACK_HANDOFF_BEFORE_END_SEC;
  const handoff = Math.min(duration, Math.max(offset, requested));
  const tail = Math.max(0, duration - handoff);
  const wanted = cueFits && cue ? cue.fade : TRACK_CROSSFADE_SEC;
  const fade = Math.min(wanted, tail > 0 ? tail : Math.max(0, duration - offset));
  return { offset, handoff, fade };
}

/** Continue a run from the saved file position, or advance when that track is in its ending. */
export function resumePlan(duration: number, savedOffset: number, name?: string): ResumePlan {
  const window = trackWindow(duration, undefined, name);
  if (!(duration > window.offset) || savedOffset >= window.handoff) return { action: 'advance' };
  return { action: 'resume', offset: Math.min(duration, Math.max(window.offset, savedOffset)) };
}

/** Fisher-Yates. A run's rotation keeps this order until that run ends. */
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

/**
 * The change-song control. Shuffle keeps the saved shuffle and moves along
 * `shuffleOrder`. A chosen track moves to the next catalogue title and that
 * title becomes the saved choice.
 */
export function choiceAfterSkip(
  choice: SongChoice,
  shuffleOrder: readonly string[],
  current: string | null,
  failed: ReadonlySet<string>,
): { choice: SongChoice; track: TrackPick | null } {
  const rotation = choice === SHUFFLE_SONG ? shuffleOrder : GAMEPLAY_TRACKS;
  const index = current ? rotation.indexOf(current) : -1;
  const start = index >= 0 ? index + 1 : 0;
  const track = pickTrack(rotation, start, failed, current);
  if (!track) return { choice, track: null };
  if (choice === SHUFFLE_SONG) return { choice: SHUFFLE_SONG, track };
  const pinned = GAME_TRACKS.find((item) => item.id === track.name);
  if (!pinned) return { choice, track: null };
  return { choice: pinned.id, track };
}

function stemUrls(base: string, name: string): readonly string[] {
  const root = base.endsWith('/') ? base : `${base}/`;
  return [`${root}${name}.m4a`, `${root}${name}.ogg`];
}

const reportedMisses = new Set<string>();

/**
 * A missing or undecodable file is skipped for the rest of this run.
 * Warn once. The next run tries the file again instead of dropping it for the page session.
 */
export function reportMissingTrack(name: string): void {
  if (reportedMisses.has(name)) return;
  reportedMisses.add(name);
  console.warn(`Kickolé music: "${name}" did not load and will be skipped until the next run.`);
}

/**
 * Files the store WebView requests, `.m4a` first.
 * The store build uses Vite `base: './'`, so this is `./audio/rob/<id>.m4a`
 * beside `index.html` (ios/App/App/public/audio/rob after cap sync).
 */
export function robAudioUrls(name: string, base = './'): readonly string[] {
  const root = base.endsWith('/') ? base : `${base}/`;
  return robAudioUrlsFromRoot(`${root}audio/rob`, name);
}

function robAudioUrlsFromRoot(base: string, name: string): readonly string[] {
  return stemUrls(base, name);
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
  const fetchImpl = options?.fetchImpl ?? fetch;
  const urls = options?.base != null
    ? stemUrls(options.base, name)
    : robAudioUrls(name, import.meta.env.BASE_URL);
  return loadFirstBuffer(ctx, urls, fetchImpl);
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
 * Menu loops menu-song. A shuffle run starts on Alley Beat, then rotates the
 * other three songs. Only the audible buffer and the next one are decoded.
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
  private disabled = new Set<string>();
  private playhead: Playhead | null = null;
  private songChoice: SongChoice = SHUFFLE_SONG;
  private skipSerial = 0;
  private jumping = false;
  /** Set when a run begins from the menu. Resume keeps the place in the file. */
  private freshRun = false;
  /** Sources still holding PCM after they leave `voices`, so a new decode can drop them. */
  private heldSources: AudioBufferSourceNode[] = [];

  private readonly load: (name: string) => Promise<AudioBuffer | null>;
  private readonly onTrack: (name: string | null) => void;
  private readonly random: () => number;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly onResult: (mode: BedMode, ok: boolean) => void = () => {},
    load?: (name: string) => Promise<AudioBuffer | null>,
    onTrack?: (name: string | null) => void,
    random: () => number = Math.random,
  ) {
    this.load = load ?? ((name) => loadTrack(ctx, name));
    this.onTrack = onTrack ?? (() => {});
    this.random = random;
  }

  /** Names whose decoded PCM is still held. At most the audible track and the next one. */
  retainedTracks(): readonly string[] {
    const names = new Set<string>();
    if (this.menuBuffer) names.add(ROB_MENU_NAME);
    if (this.cache) names.add(this.cache.name);
    for (const voice of this.voices) {
      if (voice.source.buffer) names.add(voice.track);
    }
    return [...names];
  }

  /** Drop every decoded buffer. Used when the GPU context is lost and before a run's first decode. */
  releaseDecoded() {
    this.menuBuffer = null;
    this.cache = null;
    this.prefetch = null;
    this.prefetchName = null;
    this.prefetchAt = 0;
    this.handoffAt = 0;
    this.handoffFade = 0;
    this.nextAt = 0;
    this.loop = null;
    for (const source of this.heldSources) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.buffer = null; } catch { /* already released */ }
    }
    this.heldSources = [];
    this.voices = [];
  }

  /** Tracks the player turned off. The current song moves on when it is one of them. */
  setEnabled(ids: readonly string[]) {
    const allowed = new Set(ids.filter((id) => (GAMEPLAY_TRACKS as readonly string[]).includes(id)));
    if (allowed.size === 0) {
      for (const name of GAMEPLAY_TRACKS) allowed.add(name);
    }
    this.disabled = new Set(GAMEPLAY_TRACKS.filter((name) => !allowed.has(name)));
    if (this.songChoice !== SHUFFLE_SONG && this.disabled.has(this.songChoice)) {
      this.songChoice = SHUFFLE_SONG;
    }
    if (this.mode === 'play' && this.playhead && this.disabled.has(this.playhead.name)) {
      const plan = choiceAfterSkip(SHUFFLE_SONG, this.order ?? GAMEPLAY_TRACKS, this.playhead.name, this.unavailable());
      if (!plan.track) return;
      this.playhead = { name: plan.track.name, offset: trackLeadIn(plan.track.name) };
      const serial = ++this.skipSerial;
      void this.jumpTo(plan.track.name, this.generation, serial);
    }
  }

  /** Shuffle, or one catalogue track. A new pin starts that song from the lead-in. */
  setSongChoice(choice: SongChoice) {
    if (choice === this.songChoice) return;
    this.songChoice = choice;
    if (choice === SHUFFLE_SONG) {
      const armed = this.armSkip();
      const audible = this.audibleVoice();
      if (audible) {
        this.playhead = { name: audible.track, offset: this.heardOffset(audible) };
        const index = (this.order ?? []).indexOf(audible.track);
        if (index >= 0) this.cursor = index;
        this.onTrack(audible.track);
        return;
      }
      this.playhead = null;
      if (this.bedOpen()) void this.restoreShuffle(armed.generation);
      return;
    }
    this.failed.delete(choice);
    this.playhead = { name: choice, offset: trackLeadIn(choice) };
    this.ensureOrder();
    const index = this.order?.indexOf(choice) ?? -1;
    if (index >= 0) this.cursor = index;
    this.onTrack(choice);
    if (this.bedOpen()) {
      const armed = this.armSkip();
      void this.jumpTo(choice, armed.generation, armed.serial, true);
    }
  }

  /**
   * Next track, on the menu or mid-run.
   * A menu tap pins that song so the next run opens on it. A run that is
   * still on shuffle keeps shuffle, and the next run still opens on Alley Beat.
   * The label updates before the file decodes. The previous buffer stays
   * until the new one is ready, then it is cut.
   * Returns the choice to persist.
   */
  skip(): SongChoice {
    this.ensureOrder();
    const plan = choiceAfterSkip(this.songChoice, this.order ?? GAMEPLAY_TRACKS, this.skipCursor(), this.unavailable());
    if (!plan.track) return this.songChoice;
    if (this.mode === 'menu') {
      const pinned = GAME_TRACKS.find((item) => item.id === plan.track?.name);
      if (pinned) this.songChoice = pinned.id;
    } else {
      this.songChoice = plan.choice;
    }
    const index = (this.order ?? []).indexOf(plan.track.name);
    if (index >= 0) this.cursor = index;
    this.playhead = { name: plan.track.name, offset: trackLeadIn(plan.track.name) };
    this.onTrack(plan.track.name);
    if (this.bedOpen()) {
      const armed = this.armSkip();
      void this.jumpTo(plan.track.name, armed.generation, armed.serial, true);
    }
    return this.songChoice;
  }

  setMode(mode: BedMode, force = false) {
    const live = this.voices.some((voice) => voice.stopAt > this.ctx.currentTime + 0.05);
    if (!force && this.mode === mode && (live || this.pending === mode)) return;
    const previous = this.mode;
    this.capturePlayhead();
    this.skipSerial += 1;
    this.jumping = false;
    this.generation += 1;
    const generation = this.generation;
    this.mode = mode;
    // A new run is menu -> play. Mute and background clear the mode without
    // being a new run, and must not open Alley Beat over the song in progress.
    const enteringFromMenu = mode === 'play' && previous === 'menu';
    const firstPlay = mode === 'play' && previous !== 'play' && previous !== 'menu' && !this.playhead;
    this.freshRun = force ? false : enteringFromMenu || firstPlay;
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
    this.capturePlayhead();
    this.mode = null;
    this.pending = null;
    this.skipSerial += 1;
    this.jumping = false;
    this.generation += 1;
    this.fadeOutAll(0.35);
    this.onTrack(null);
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
    if (this.songChoice !== SHUFFLE_SONG && !this.unavailable().has(this.songChoice)) {
      const pinned = await this.startPinned(generation);
      if (generation !== this.generation || this.mode !== 'menu') return false;
      if (pinned) return true;
    }
    const ready = this.menuBuffer ?? (this.cache?.name === ROB_MENU_NAME ? this.cache.buffer : null);
    const buffer = ready ?? await this.load(ROB_MENU_NAME);
    if (generation !== this.generation || this.mode !== 'menu') return false;
    if (!buffer) return false;
    this.menuBuffer = buffer;
    this.beginMenu(this.ctx.currentTime, MODE_CROSSFADE_SEC);
    if (this.cache && this.cache.buffer !== buffer) this.cache = null;
    this.onTrack(ROB_MENU_NAME);
    return true;
  }

  private async startPlay(generation: number): Promise<boolean> {
    const fresh = this.freshRun;
    this.freshRun = false;
    if (fresh) this.playhead = null;
    if (fresh && this.songChoice === SHUFFLE_SONG) return this.beginFreshShuffle(generation);
    const order = this.ensureOrder();
    if (this.songChoice !== SHUFFLE_SONG) {
      const pinned = await this.startPinned(generation);
      if (generation !== this.generation || this.mode !== 'play') return false;
      if (pinned) return true;
    }
    const saved = this.playhead;
    if (saved && !this.unavailable().has(saved.name)) {
      const buffer = await this.song(saved.name, generation);
      if (generation !== this.generation || this.mode !== 'play') return false;
      if (buffer) {
        const plan = resumePlan(buffer.duration, saved.offset, saved.name);
        if (plan.action === 'resume') {
          this.cursor = Math.max(0, order.indexOf(saved.name));
          this.spawnTrack(buffer, saved.name, plan.offset, this.ctx.currentTime, MODE_CROSSFADE_SEC);
          this.releaseMenu();
          return true;
        }
        this.cursor = (Math.max(0, order.indexOf(saved.name)) + 1) % order.length;
      } else {
        this.markMissing(saved.name);
        this.cursor = (Math.max(0, order.indexOf(saved.name)) + 1) % order.length;
      }
      this.playhead = null;
    }
    const previous = saved?.name ?? null;
    const next = await this.takeNext(this.cursor, previous, generation);
    if (generation !== this.generation || this.mode !== 'play' || !next) return false;
    this.cursor = next.index;
    this.spawnTrack(next.buffer, next.name, trackWindow(next.buffer.duration, undefined, next.name).offset, this.ctx.currentTime, MODE_CROSSFADE_SEC);
    this.releaseMenu();
    return true;
  }

  private async takeRotation(previous: string | null, generation: number) {
    const order = this.order ?? [];
    const tried = new Set<string>();
    let current = previous;
    while (tried.size < order.length) {
      const pick = nextRotationTrack(order, current, this.unavailable());
      if (!pick || tried.has(pick.name)) return null;
      tried.add(pick.name);
      const buffer = await this.song(pick.name, generation);
      if (generation !== this.generation) return null;
      if (buffer && buffer.duration > trackLeadIn(pick.name) + 0.05) return { ...pick, buffer };
      this.markMissing(pick.name);
      current = pick.name;
    }
    return null;
  }

  private async takeNext(startIndex: number, previous: string | null, generation: number) {
    const order = this.order ?? [];
    const tried = new Set<string>();
    let index = startIndex;
    let prior = previous;
    while (tried.size < order.length) {
      const pick = pickTrack(order, index, this.unavailable(), prior);
      if (!pick || tried.has(pick.name)) return null;
      tried.add(pick.name);
      const buffer = await this.song(pick.name, generation);
      if (generation !== this.generation) return null;
      if (buffer && buffer.duration > trackLeadIn(pick.name) + 0.05) return { ...pick, buffer };
      this.markMissing(pick.name);
      index = pick.index + 1;
      prior = null;
    }
    return null;
  }

  private async beginFreshShuffle(generation: number): Promise<boolean> {
    this.releaseDecoded();
    this.failed.clear();
    const enabled = GAMEPLAY_TRACKS.filter((name) => !this.disabled.has(name));
    this.order = openingPlaylist(enabled, this.random);
    this.cursor = 0;
    this.playhead = null;
    let name = this.order.find((track) => !this.unavailable().has(track)) ?? null;
    if (!name) return false;
    let buffer = await this.song(name, generation);
    if (generation !== this.generation || this.mode !== 'play') return false;
    if (!buffer || !(buffer.duration > trackLeadIn(name) + 0.05)) {
      this.markMissing(name);
      const fallback = nextRotationTrack(this.order, name, this.unavailable());
      if (!fallback) return false;
      name = fallback.name;
      buffer = await this.song(name, generation);
      if (generation !== this.generation || this.mode !== 'play' || !buffer) return false;
      this.cursor = fallback.index;
    } else {
      const index = this.order.indexOf(name);
      if (index >= 0) this.cursor = index;
    }
    const offset = trackWindow(buffer.duration, undefined, name).offset;
    this.spawnTrack(buffer, name, offset, this.ctx.currentTime, MODE_CROSSFADE_SEC);
    return true;
  }

  private async song(name: string, generation: number): Promise<AudioBuffer | null> {
    if (this.cache?.name === name) return this.cache.buffer;
    if (name === ROB_MENU_NAME && this.menuBuffer) return this.menuBuffer;
    this.freeIdleAudio();
    const buffer = await this.load(name);
    if (!buffer || generation !== this.generation) return null;
    this.cache = { name, buffer };
    return buffer;
  }

  /** Drop PCM that is not currently audible so a decode never stacks a third song. */
  private freeIdleAudio() {
    const audible = new Set<string>();
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      if (voice.source.buffer && voice.stopAt > now) audible.add(voice.track);
    }
    if (this.menuBuffer && !audible.has(ROB_MENU_NAME)) this.menuBuffer = null;
    if (this.cache && !audible.has(this.cache.name)) this.cache = null;
    for (const voice of this.voices) {
      if (audible.has(voice.track)) continue;
      try { voice.source.buffer = null; } catch { /* already released */ }
    }
    for (const source of this.heldSources) {
      const live = this.voices.some((voice) => voice.source === source && audible.has(voice.track));
      if (live) continue;
      try { source.buffer = null; } catch { /* already released */ }
    }
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
    if (this.handoffAt > 0 && this.bedOpen() && now + 0.45 >= this.handoffAt) {
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

  private async startPinned(generation: number): Promise<boolean> {
    const name = this.songChoice;
    if (name === SHUFFLE_SONG || this.unavailable().has(name)) return false;
    const buffer = await this.song(name, generation);
    if (generation !== this.generation || !this.bedOpen()) return false;
    if (!buffer || !(buffer.duration > trackLeadIn(name) + 0.05)) {
      this.markMissing(name);
      return false;
    }
    const saved = this.playhead?.name === name ? this.playhead.offset : trackLeadIn(name);
    const plan = resumePlan(buffer.duration, saved, name);
    const offset = plan.action === 'resume' ? plan.offset : trackWindow(buffer.duration, undefined, name).offset;
    const index = (this.order ?? []).indexOf(name);
    if (index >= 0) this.cursor = index;
    this.spawnTrack(buffer, name, offset, this.ctx.currentTime, MODE_CROSSFADE_SEC);
    this.releaseMenu();
    return true;
  }

  /** The buffer that is audible, or the playhead when a skip is already in flight. */
  private currentName(): string | null {
    const now = this.ctx.currentTime;
    const voice = [...this.voices].reverse().find((item) => item.stopAt > now);
    if (voice) return voice.track;
    if (this.playhead && !this.unavailable().has(this.playhead.name)) return this.playhead.name;
    if (this.songChoice !== SHUFFLE_SONG) return this.songChoice;
    return null;
  }

  /**
   * Cancel a menu bed or a run opener that is still decoding, and cancel
   * the previous skip. The new jump carries the returned generation.
   */
  private armSkip(): { generation: number; serial: number } {
    this.generation += 1;
    this.pending = null;
    const serial = ++this.skipSerial;
    return { generation: this.generation, serial };
  }

  private acceptsJump(immediate: boolean): boolean {
    if (this.mode === 'play') return true;
    return immediate && this.mode === 'menu';
  }

  private unavailable(): Set<string> {
    const names = new Set(this.failed);
    for (const name of this.disabled) names.add(name);
    return names;
  }

  private markMissing(name: string) {
    this.failed.add(name);
    reportMissingTrack(name);
  }

  private bedOpen(): boolean {
    return this.mode === 'play' || this.mode === 'menu';
  }

  /**
   * While a tap is waiting on a decode, the old buffer is still audible.
   * The cursor has to follow the song the pill already shows.
   * The menu loop is not a playlist position, so the first tap can offer every song.
   */
  private skipCursor(): string | null {
    if (this.jumping && this.playhead) return this.playhead.name;
    if (this.menuBedOnly()) return null;
    return this.currentName();
  }

  /** The menu loop is We Rise. It is not a playlist position, so the first tap can offer every song. */
  private menuBedOnly(): boolean {
    const now = this.ctx.currentTime;
    const live = this.voices.filter((voice) => voice.stopAt > now);
    return live.length > 0 && live.every((voice) => voice.role === 'menu');
  }

  private audibleVoice(): Voice | null {
    const now = this.ctx.currentTime;
    return [...this.voices].reverse().find((voice) => voice.stopAt > now + 0.05) ?? null;
  }

  private heardOffset(voice: Voice): number {
    return voice.fileStart + Math.max(0, this.ctx.currentTime - voice.startedAt);
  }

  /** Shuffle was chosen while nothing was audible. Start the bed again instead of staying silent. */
  private async restoreShuffle(generation: number) {
    if (generation !== this.generation || !this.bedOpen()) return;
    if (this.mode === 'menu') {
      await this.startMenu(generation);
      return;
    }
    this.freshRun = true;
    await this.startPlay(generation);
  }

  private ensureOrder(): string[] {
    if (!this.order) {
      const enabled = GAMEPLAY_TRACKS.filter((name) => !this.disabled.has(name));
      this.order = openingPlaylist(enabled, this.random);
    }
    return this.order;
  }

  private async jumpTo(name: string, generation: number, serial: number, immediate = false) {
    this.jumping = true;
    let target = name;
    let buffer = await this.song(target, generation);
    if (generation !== this.generation || serial !== this.skipSerial || !this.acceptsJump(immediate)) {
      if (serial === this.skipSerial) this.jumping = false;
      return;
    }
    if (!buffer || !(buffer.duration > trackLeadIn(target) + 0.05)) {
      this.markMissing(target);
      const taken = await this.takeNext(this.ensureOrder().indexOf(target) + 1, target, generation);
      if (generation !== this.generation || serial !== this.skipSerial || !this.acceptsJump(immediate) || !taken) {
        if (serial === this.skipSerial) this.jumping = false;
        return;
      }
      target = taken.name;
      buffer = taken.buffer;
      this.failed.delete(target);
      this.onTrack(target);
      if (this.mode === 'menu') {
        const pinned = GAME_TRACKS.find((item) => item.id === target);
        if (pinned) this.songChoice = pinned.id;
      }
    } else {
      this.failed.delete(target);
    }
    if (serial !== this.skipSerial || generation !== this.generation) return;
    const index = this.ensureOrder().indexOf(target);
    if (index >= 0) this.cursor = index;
    const fade = immediate ? 0 : TRACK_CROSSFADE_SEC;
    if (immediate) this.stopVoicesNow();
    else this.fadeOutAll(TRACK_CROSSFADE_SEC);
    this.spawnTrack(buffer, target, trackWindow(buffer.duration, undefined, target).offset, this.ctx.currentTime, fade);
    this.jumping = false;
  }

  private async crossfadeNext(when: number, fade: number, generation: number) {
    const order = this.ensureOrder();
    if (!this.bedOpen()) return;
    if (this.songChoice !== SHUFFLE_SONG && !this.unavailable().has(this.songChoice)) {
      const name = this.songChoice;
      const pinned = await this.song(name, generation);
      if (generation !== this.generation || !this.bedOpen()) return;
      if (pinned && pinned.duration > trackLeadIn(name) + 0.05) {
        const index = order.indexOf(name);
        if (index >= 0) this.cursor = index;
        this.spawnTrack(pinned, name, trackWindow(pinned.duration, undefined, name).offset, when, fade);
        return;
      }
      this.markMissing(name);
    }
    const previous = this.playhead?.name ?? order[this.cursor] ?? null;
    const hoped = this.songChoice === SHUFFLE_SONG
      ? nextRotationTrack(order, previous, this.unavailable())
      : pickTrack(order, this.cursor + 1, this.unavailable(), previous);
    const loaded = this.prefetch;
    this.prefetch = null;
    this.prefetchName = null;
    let buffer: AudioBuffer | null = null;
    let pick: TrackPick | null = null;
    if (loaded && hoped) {
      const decoded = await loaded;
      if (generation !== this.generation || !this.bedOpen()) return;
      if (hoped && !decoded) this.markMissing(hoped.name);
      if (hoped && decoded && this.cache?.name === hoped.name) {
        buffer = decoded;
        pick = hoped;
      }
    }
    if (!pick || !buffer) {
      const taken = this.songChoice === SHUFFLE_SONG
        ? await this.takeRotation(previous, generation)
        : await this.takeNext(this.cursor + 1, previous, generation);
      if (generation !== this.generation || !this.bedOpen() || !taken) {
        if (generation === this.generation && this.mode) this.onResult(this.mode, false);
        return;
      }
      pick = taken;
      buffer = taken.buffer;
    }
    this.cursor = pick.index;
    this.spawnTrack(buffer, pick.name, trackWindow(buffer.duration, undefined, pick.name).offset, when, fade);
  }

  private spawnTrack(buffer: AudioBuffer, name: string, offset: number, when: number, fadeIn: number) {
    const plan = trackWindow(buffer.duration, offset, name);
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
    const next = this.songChoice === SHUFFLE_SONG
      ? nextRotationTrack(this.order ?? [], name, this.unavailable())
      : null;
    this.prefetch = null;
    this.prefetchName = next?.name ?? null;
    this.prefetchAt = next ? this.handoffAt - PREFETCH_SEC : 0;
    if (next && this.prefetchAt <= this.ctx.currentTime) {
      this.prefetchAt = 0;
      this.prefetch = this.song(next.name, this.generation);
    }
    this.onTrack(name);
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
    if (this.jumping) return;
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
    // duration ends the buffer on its own. An earlier stop() would throw
    // on a user skip, and WKWebView would keep the previous song audible.
    source.start(start, Math.max(0, offset), duration);
    const voice: Voice = { source, gain, stopAt: end, role, track, fileStart: Math.max(0, offset), startedAt: start };
    this.voices.push(voice);
    this.heldSources.push(source);
    source.onended = () => {
      this.voices = this.voices.filter((item) => item !== voice);
      this.heldSources = this.heldSources.filter((item) => item !== source);
      try { source.buffer = null; } catch { /* the node has already released it */ }
    };
  }

  /** Cut every buffer now. A user skip must not leave the previous song running. */
  private stopVoicesNow() {
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0.0001, now);
        voice.source.stop(now);
        voice.stopAt = now;
      } catch {
        /* the buffer already ended */
      }
    }
    this.clearSchedule();
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
    this.clearSchedule();
  }

  private clearSchedule() {
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

import {
  createDefaultPurchaseService,
  PurchaseService,
  shouldIgnoreStaleRevoke,
  shouldKeepRecentGrant,
} from '../billing/PurchaseService';
import {
  shouldRefreshEntitlementsOnResume,
  STORE_UNAVAILABLE_MESSAGE,
} from '../billing/storeCopy';
import type { BillingPlatform, EntitlementSnapshot, PurchaseResult, StoreProduct } from '../billing/types';
import { GameEngine, type EngineEvent, type Phase, type TrickKind } from '../engine/engine';
import type { Grade, Side } from '../engine/config';
import type { Appearance } from './appearance';
import { beatClock, cheer, setBed, setEnabledTracks, setSongChoice, sfx, skipTrack, unlockAudio } from './audio';
import {
  applyPromptAction,
  beginRun,
  freshClock,
  actionForTrick,
  tickPrompts,
  type ActivePrompt,
  type PromptAction,
  type PromptClock,
} from './prompts';
import { beatErrorMs, beatsToSeconds, GAMEPLAY_BPM, gradeBeat } from './beat';
import { crowdLevel, loudestCheer, milestoneHits, newlyOpenedTiers, type AudioProgress } from './audioPolicy';
import {
  celebrationDance,
  getDance,
  rankFromCheers,
  withDanceRank,
} from './dances';
import { fx } from '../scene/fx';
import { playHaptic, type HapticCue } from './haptics';
import { prefersReducedMotion, swoopStrength } from '../scene/juice';
import { composePlayerSkin, type Skin } from './skins';
import { normalizeEnabledTracks, SHUFFLE_SONG, toggleEnabled, type GameTrackId } from './tracks';
import {
  buyOrEquipBoot,
  buyOrEquipKit,
  equipOwnedDance,
  type ChallengeProgress,
} from './shop';
import {
  choosePlayerBody,
  applyGraphicsPatch,
  loadSave,
  loadSettings,
  persistSave,
  saveRun,
  saveSettings,
  updateAppearance,
  type SaveData,
  type Settings,
} from './storage';

export type ArmedTrick = Extract<TrickKind, 'aroundTheWorld' | 'thigh' | 'highFlick' | 'groove'>;

export interface Feedback {
  id: number;
  kind: Grade | 'stall';
  text: string;
  points: number;
}

export interface Hud {
  phase: Phase;
  score: number;
  kickUps: number;
  streak: number;
  feedback: Feedback | null;
  stalling: boolean;
  armedTrick: ArmedTrick | null;
  /** Foot trick is waiting for the ball, so the button already did its job. */
  trickQueued: boolean;
  neckHolding: boolean;
  celebrating: boolean;
  celebrationLabel: string | null;
  prompt: ActivePrompt | null;
  hintTip: string | null;
}

export interface Result {
  score: number;
  kickUps: number;
  bestStreak: number;
  /** Combo events in the run. Sent with the score. */
  combos: number;
  /** Run clock in milliseconds. Sent with the score. */
  durationMs: number;
  /** Kick times in milliseconds from the start of this run. */
  kickTimesMs: number[];
  newBest: boolean;
  rank: number;
  coinsEarned: number;
}

export interface Snapshot {
  hud: Hud;
  save: SaveData;
  settings: Settings;
  skin: Skin;
  result: Result | null;
  launchProduct: StoreProduct | null;
  billingPlatform: BillingPlatform;
  billingMessage: string | null;
  billingBusy: boolean;
}

/** Glues the engine to storage, audio, haptics and React (via subscribe/getSnapshot). */
export class GameController {
  readonly engine = new GameEngine();
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private feedbackId = 0;
  private feedback: Feedback | null = null;
  private result: Result | null = null;
  private save = loadSave();
  private settings = loadSettings();
  /** Per-run challenge tallies flushed into the save on game over. */
  private runChallenges: ChallengeProgress = { alternateFoot: 0, stalls: 0, perfectTouch: 0 };
  private kickTimesMs: number[] = [];
  /** Engine clock when this run was prepared. Submitted times are relative to it. */
  private runStartTime = 0;
  private perfects = 0;
  private progress: AudioProgress = { streak: 0, kickUps: 0, perfects: 0 };
  private pendingCheers: string[] = [];
  private queuedCelebration: string | null = null;
  private prompts: PromptClock = freshClock([], true);
  /** The thigh and rainbow finish events are followed by a kick in the same turn. */
  private suppressKickPrompt = false;
  private readonly billing: PurchaseService = createDefaultPurchaseService();
  private billingMessage: string | null = null;
  private billingBusy = false;
  private billingReady: Promise<void>;
  /** Bumped when a live store event lands, so an older refresh cannot overwrite it. */
  private entitlementEpoch = 0;
  /** Drops a stale not-owned event that arrives just after a grant. */
  private grantGuardUntil = 0;
  /** Pause menu is open, so the ball stays where it is. */
  private playHeld = false;
  private readonly onVisibility = () => {
    if (!shouldRefreshEntitlementsOnResume(this.billing.platform, document.visibilityState)) return;
    void this.pullEntitlements();
  };

  constructor() {
    this.engine.prepare('menu');
    this.prompts = beginRun(this.save.learnedTricks, this.settings.hints);
    this.engine.on((e) => this.onEvent(e));
    this.billing.setEntitlementListener((snapshot) => this.applyBillingSnapshot(snapshot));
    setEnabledTracks(this.settings.enabledSongs);
    setSongChoice(this.settings.song);
    this.snapshot = this.build();
    this.billingReady = this.initBilling();
    if (this.billing.platform !== 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  private async initBilling() {
    try {
      await this.billing.init();
      await this.pullEntitlements();
    } catch {
      this.billingMessage = STORE_UNAVAILABLE_MESSAGE;
    }
    this.publish();
  }

  private async pullEntitlements() {
    const epoch = this.entitlementEpoch;
    const next = await this.billing.syncEntitlements(this.save) as SaveData;
    if (epoch !== this.entitlementEpoch) return;
    if (shouldKeepRecentGrant(this.save.launchCollectionOwned, next.launchCollectionOwned, this.grantGuardUntil, Date.now())) {
      return;
    }
    this.save = { ...this.save, ...next };
    persistSave(this.save);
    this.publish();
  }

  private applyBillingSnapshot(snapshot: EntitlementSnapshot) {
    if (shouldIgnoreStaleRevoke(snapshot, this.grantGuardUntil, Date.now())) return;
    if (snapshot.owned && (snapshot.source === 'apple' || snapshot.source === 'google')) {
      this.grantGuardUntil = Date.now() + 10_000;
    }
    this.entitlementEpoch += 1;
    const before = this.save.launchCollectionOwned;
    const next = this.billing.applyStoreSnapshot(this.save, snapshot);
    this.save = { ...this.save, ...next };
    if (before !== next.launchCollectionOwned) {
      this.billingMessage = next.launchCollectionOwned
        ? 'Launch Collection unlocked.'
        : 'Launch Collection is no longer on this store account.';
    }
    persistSave(this.save);
    this.publish();
  }

  private failedBilling(): PurchaseResult {
    this.billingMessage = STORE_UNAVAILABLE_MESSAGE;
    return {
      outcome: 'failed',
      entitlement: { owned: false, source: 'none', verifiedAt: 0, transactionRef: null },
      message: STORE_UNAVAILABLE_MESSAGE,
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = () => this.snapshot;

  private liveSkin(preview?: { kitId?: string | null; bootId?: string | null }): Skin {
    return composePlayerSkin(
      this.save.appearance,
      preview?.kitId ?? this.save.equippedKit,
      preview?.bootId ?? this.save.equippedBoot,
    );
  }

  private build(preview?: { kitId?: string | null; bootId?: string | null }): Snapshot {
    const e = this.engine;
    const armed = e.selectedTrick;
    return {
      hud: {
        phase: e.phase,
        score: e.stats.score,
        kickUps: e.stats.kickUps,
        streak: e.streak,
        feedback: this.feedback,
        stalling: e.contact?.kind === 'stall',
        armedTrick: armed === 'aroundTheWorld' || armed === 'thigh' || armed === 'highFlick' || armed === 'groove' ? armed : null,
        trickQueued: e.queuedFoot != null,
        neckHolding: e.trick?.kind === 'neckStall'
          && (e.trick.phase === 'contact' || e.trick.phase === 'execute'),
        celebrating: e.celebration != null,
        celebrationLabel: e.celebration ? (getDance(e.celebration.danceId)?.name ?? 'Dance') : null,
        prompt: e.phase === 'playing' ? this.prompts.active : null,
        hintTip: e.phase === 'playing' ? this.prompts.tip : null,
      },
      save: this.save,
      settings: this.settings,
      skin: this.liveSkin(preview),
      result: this.result,
      launchProduct: this.billing.launchProduct,
      billingPlatform: this.billing.platform,
      billingMessage: this.billingMessage,
      billingBusy: this.billingBusy,
    };
  }

  private publish(preview?: { kitId?: string | null; bootId?: string | null }) {
    this.noteMilestones();
    this.snapshot = this.build(preview);
    this.listeners.forEach((l) => l());
  }

  private voices(): boolean {
    return this.settings.sound && this.settings.sfx;
  }

  private syncBed() {
    const playing = this.engine.phase === 'playing';
    setBed({
      mode: playing ? 'play' : 'menu',
      music: this.settings.sound && this.settings.music,
      sfx: this.voices(),
      crowd: playing && this.voices() ? crowdLevel(this.engine.streak) : 0,
      musicVolume: this.settings.musicVolume,
      sfxVolume: this.settings.sfxVolume,
    });
  }

  /** Milestone cheers and the crowd/music mix. Scoring is untouched. */
  private noteMilestones() {
    const next: AudioProgress = {
      streak: this.engine.streak,
      kickUps: this.engine.stats.kickUps,
      perfects: this.perfects,
    };
    const hits = [...milestoneHits(this.progress, next), ...this.pendingCheers];
    this.progress = next;
    this.pendingCheers = [];
    const id = loudestCheer(hits);
    if (id && this.voices()) cheer(id);
    const rank = rankFromCheers(hits);
    if (rank > this.save.danceRank) {
      const dances = withDanceRank(this.save, rank);
      this.save = { ...this.save, ...dances };
      persistSave(this.save);
    }
    if (id) this.queueCelebration(id);
    this.engine.equippedDance = this.save.equippedDance;
    this.syncBed();
  }

  private trickBusy(): boolean {
    const trick = this.engine.trick;
    return this.engine.contact != null
      || (trick != null && trick.phase !== 'recover' && trick.phase !== 'fail');
  }

  private queueCelebration(reason: string) {
    if (this.engine.celebration) return;
    if (this.engine.phase === 'playing' && this.trickBusy()) {
      this.queuedCelebration = reason;
      return;
    }
    this.beginCelebration(reason);
  }

  private beginCelebration(reason: string) {
    const dance = celebrationDance(reason, this.save.equippedDance, this.save.ownedDances);
    const reduced = prefersReducedMotion();
    const beats = reduced ? 1 : 2;
    this.engine.reducedMotion = reduced;
    this.engine.equippedDance = this.save.equippedDance;
    this.engine.startCelebration(dance, reason, beatsToSeconds(beats, GAMEPLAY_BPM));
    fx.flash = reduced ? 0.25 : 1;
    fx.confetti = reduced ? 0 : 1;
    const big = reason.endsWith(':50') || reason.endsWith(':100') || reason.startsWith('tier:') || reason === 'best';
    if (big) fx.swoop = Math.max(fx.swoop, swoopStrength(this.engine.streak, big ? 5 : 0, reduced));
  }

  /** Resume the audio graph from a tap or key press. */
  primeAudio() {
    this.syncBed();
    unlockAudio();
  }

  private buzz(cue: HapticCue) {
    void playHaptic(cue, this.settings.vibration);
  }

  private show(kind: Feedback['kind'], text: string, points: number) {
    this.feedback = { id: ++this.feedbackId, kind, text, points };
  }

  private onEvent(e: EngineEvent) {
    const sound = this.voices();
    if (e.type === 'kick' && e.grade === 'perfect') this.perfects += 1;
    if (e.type === 'trick' && e.kind === 'header' && e.phase === 'execute' && this.engine.lastKickGrade === 'perfect') {
      this.perfects += 1;
    }
    switch (e.type) {
      case 'launch':
        this.buzz('launch');
        break;
      case 'kick': {
        this.kickTimesMs.push(this.runElapsedMs());
        if (e.alternate) this.runChallenges.alternateFoot += 1;
        if (e.stall) this.runChallenges.stalls += 1;
        if (e.grade === 'perfect') this.runChallenges.perfectTouch += 1;
        const high = this.engine.lastTrick?.kind === 'highFlick'
          && Math.abs(this.engine.lastTrick.time - this.engine.time) < 0.05;
        const label = e.stall ? 'FOOT STALL!' : high ? 'HIGH FLICK!' : e.grade.toUpperCase();
        this.show(e.stall ? 'stall' : e.grade, label, e.points);
        if (sound) { if (e.stall) sfx.stall(); sfx.kick(e.grade, e.streak); }
        this.buzz(e.grade);
        fx.swoop = Math.max(fx.swoop, swoopStrength(e.streak, 0, prefersReducedMotion()));
        if (this.suppressKickPrompt) this.suppressKickPrompt = false;
        else if (high) this.onPromptAction('flick');
        else this.onPromptAction('kick');
        this.publish();
        break;
      }
      case 'miss':
        this.show('miss', 'MISS', 0);
        if (sound) sfx.miss();
        this.buzz('miss');
        this.onPromptAction('miss');
        this.publish();
        break;
      case 'stallStart':
        this.publish();
        break;
      case 'trick':
        if (e.points > 0) {
          const beat = this.engine.lastBeatGrade;
          const label = e.kind === 'header' ? 'HEADER!'
            : e.kind === 'thigh' ? 'THIGH!'
              : e.kind === 'neckStall' ? 'NECK STALL!'
                : e.kind === 'aroundTheWorld' ? 'AROUND THE WORLD!'
                  : e.kind === 'highFlick' ? 'HIGH FLICK!'
                    : e.kind === 'groove'
                      ? (beat === 'perfect' ? 'ON BEAT!' : beat === 'good' ? 'GROOVE!' : 'KEEP UP')
                      : 'TRICK!';
          this.show(beat === 'off' && e.kind === 'groove' ? 'good' : 'perfect', label, e.points);
        } else if (e.kind === 'neckStall' && e.phase === 'execute') {
          this.show('good', 'NECK RELEASE', 0);
        }
        if (e.points > 0 && sound) sfx.trick();
        this.noteTrickPrompt(e.kind, e.phase, e.points);
        this.publish();
        break;
      case 'combo':
        this.show('perfect', `${e.label} +${e.points}`, e.points);
        if (sound) sfx.combo();
        this.buzz('combo');
        fx.swoop = Math.max(fx.swoop, swoopStrength(this.engine.streak, e.points, prefersReducedMotion()));
        this.publish();
        break;
      case 'trickFail':
        this.show('miss', 'TRICK MISS', 0);
        this.buzz('miss');
        this.onPromptAction('miss');
        this.publish();
        break;
      case 'drop':
        if (sound) sfx.drop();
        this.buzz('drop');
        this.publish();
        break;
      case 'over': {
        const s = this.engine.stats;
        const beforeLocker = { coins: this.save.coins, challenges: this.save.challenges };
        const r = s.score > 0
          ? saveRun(
            this.save,
            { score: s.score, kickUps: s.kickUps, date: Date.now() },
            this.runChallenges,
          )
          : { save: this.save, newBest: false, rank: -1, coinsEarned: 0 };
        if (r.newBest) this.pendingCheers.push('best');
        for (const tier of newlyOpenedTiers(beforeLocker, r.save)) this.pendingCheers.push(`tier:${tier}`);
        this.save = r.save;
        this.result = {
          score: s.score,
          kickUps: s.kickUps,
          bestStreak: s.bestStreak,
          combos: s.combos,
          durationMs: this.runElapsedMs(),
          kickTimesMs: this.kickTimesMs,
          newBest: r.newBest,
          rank: r.rank,
          coinsEarned: r.coinsEarned,
        };
        this.runChallenges = { alternateFoot: 0, stalls: 0, perfectTouch: 0 };
        this.publish();
        break;
      }
      default: {
        const unexpected: never = e;
        return unexpected;
      }
    }
  }

  refresh() { this.publish(); }

  tick(dt: number) {
    if (this.playHeld) return;
    const before = this.engine.phase;
    const clock = beatClock();
    this.engine.beatPhase = clock.phase;
    this.engine.reducedMotion = prefersReducedMotion();
    this.engine.equippedDance = this.save.equippedDance;
    const celebrating = this.engine.celebration != null;
    this.engine.update(dt);
    if (celebrating && !this.engine.celebration) this.publish();
    else if (before !== this.engine.phase) this.publish();
    if (this.queuedCelebration && !this.engine.celebration && !this.trickBusy()) {
      const reason = this.queuedCelebration;
      this.queuedCelebration = null;
      this.beginCelebration(reason);
      this.publish();
    }
    if (this.engine.phase === 'playing' && this.settings.hints) {
      const previousPrompt = this.promptKey();
      this.prompts = tickPrompts(this.prompts, this.engine.time, Math.floor(this.engine.time));
      if (this.promptKey() !== previousPrompt) this.publish();
    }
  }

  private promptKey(): string {
    const active = this.prompts.active;
    return `${active?.id ?? ''}:${active?.chainCount ?? 0}:${active?.startedAt ?? 0}:${this.prompts.tip ?? ''}`;
  }

  private noteTrickPrompt(kind: string, phase: string, points: number) {
    const action = actionForTrick(kind, phase, points);
    if (action === 'thigh' || action === 'rainbow') this.suppressKickPrompt = true;
    if (action) this.onPromptAction(action);
  }

  private onPromptAction(action: PromptAction) {
    if (!this.settings.hints || this.engine.phase !== 'playing') return;
    const beat = action === 'groove'
      ? (this.engine.lastBeatGrade === 'perfect' || this.engine.lastBeatGrade === 'good' ? this.engine.lastBeatGrade : 'off')
      : null;
    const result = applyPromptAction(this.prompts, action, this.engine.time, beat);
    this.prompts = result.clock;
    if (result.learned) {
      this.save = { ...this.save, learnedTricks: result.clock.learned };
      persistSave(this.save);
    }
    if (result.bonus > 0) {
      this.engine.stats.score += result.bonus;
      this.show('perfect', result.call ?? 'NAILED IT!', result.bonus);
      if (this.voices()) cheer('prompt');
      if (!prefersReducedMotion()) fx.confetti = 1;
      fx.flash = Math.max(fx.flash, 0.35);
    }
  }

  press(side: Side, pointerId?: number) {
    if (this.playHeld) return;
    const e = this.engine;
    const skippedDance = e.celebration != null;
    if (skippedDance) {
      e.skipCelebration();
      this.queuedCelebration = null;
    }
    if (e.phase === 'menu' || e.phase === 'over' || e.phase === 'dropped') {
      if (skippedDance) this.publish();
      return;
    }
    const clock = beatClock();
    e.setBeatGrade(gradeBeat(beatErrorMs(clock.now, clock.origin, clock.bpm, clock.latency)));
    const before = e.phase;
    const beforeTrick = e.selectedTrick;
    e.press(side, pointerId ?? null);
    if (skippedDance || before !== e.phase || beforeTrick !== e.selectedTrick || e.contact || e.trick || e.kickCharge) {
      this.publish();
    }
  }

  releasePointer(pointerId: number) {
    const was = this.engine.contact;
    this.engine.releaseMatching(pointerId);
    if (was && !this.engine.contact) this.publish();
  }

  release(side: Side) {
    const was = this.engine.contact;
    this.engine.release(side);
    if (was && !this.engine.contact) this.publish();
  }

  noteLockedTrick() {
    if (this.engine.phase === 'playing') return;
    this.show('poor', 'KICK FIRST', 0);
    this.publish();
  }

  attemptHeader() {
    if (this.playHeld) return;
    if (this.engine.phase !== 'playing') {
      this.noteLockedTrick();
      return;
    }
    this.engine.attemptHeader();
    this.publish();
  }

  pressNeck() {
    if (this.playHeld) return;
    if (this.engine.phase !== 'playing') {
      this.noteLockedTrick();
      return;
    }
    this.engine.pressNeck();
    this.publish();
  }

  releaseNeck() {
    this.engine.releaseNeck();
    this.publish();
  }

  armTrick(kind: ArmedTrick | null) {
    if (this.playHeld) return;
    if (kind !== null) {
      this.playTrick(kind);
      return;
    }
    if (this.engine.phase !== 'playing' && this.engine.phase !== 'ready') return;
    this.engine.armTrick(null);
    this.publish();
  }

  /** One tap plays the trick. Before the first kick, say why the button is grey. */
  playTrick(kind: ArmedTrick): 'fired' | 'queued' | 'locked' {
    if (this.playHeld) return 'locked';
    if (this.engine.phase !== 'playing') {
      this.noteLockedTrick();
      return 'locked';
    }
    const result = this.engine.requestFootTrick(kind);
    this.publish();
    return result;
  }

  action() {
    if (this.playHeld) return;
    const p = this.engine.phase;
    if (p === 'menu' || p === 'over') this.play();
    else if (p === 'ready') this.press('right');
  }

  skipCelebration() {
    if (!this.engine.skipCelebration()) return;
    this.queuedCelebration = null;
    this.publish();
  }

  equipDance(id: string): boolean {
    const result = equipOwnedDance(this.save, id);
    if (!result.ok) return false;
    this.save = { ...this.save, ...result.locker };
    this.engine.equippedDance = this.save.equippedDance;
    persistSave(this.save);
    this.publish();
    return true;
  }

  play() {
    this.feedback = null;
    this.result = null;
    this.runChallenges = { alternateFoot: 0, stalls: 0, perfectTouch: 0 };
    this.kickTimesMs = [];
    this.perfects = 0;
    this.progress = { streak: 0, kickUps: 0, perfects: 0 };
    this.pendingCheers = [];
    this.queuedCelebration = null;
    this.suppressKickPrompt = false;
    this.prompts = beginRun(this.save.learnedTricks, this.settings.hints);
    this.engine.prepare('ready');
    this.runStartTime = this.engine.time;
    this.publish();
  }

  /** Milliseconds since play(), not since the app or the menu was opened. */
  private runElapsedMs(): number {
    return Math.max(0, Math.round((this.engine.time - this.runStartTime) * 1000));
  }

  home() {
    this.feedback = null;
    this.result = null;
    this.suppressKickPrompt = false;
    this.prompts = freshClock(this.save.learnedTricks, this.settings.hints);
    this.engine.prepare('menu');
    this.publish();
  }

  updateSettings(patch: Partial<Settings>) {
    const beforeSong = this.settings.song;
    this.settings = applyGraphicsPatch(this.settings, patch);
    if (patch.enabledSongs !== undefined) {
      this.settings = { ...this.settings, enabledSongs: normalizeEnabledTracks(this.settings.enabledSongs) };
    }
    if (this.settings.song !== SHUFFLE_SONG && !this.settings.enabledSongs.includes(this.settings.song)) {
      this.settings = { ...this.settings, song: SHUFFLE_SONG };
    }
    if (patch.hints === false) this.prompts = freshClock(this.save.learnedTricks, false);
    if (patch.hints === true) this.prompts = beginRun(this.save.learnedTricks, true);
    if (patch.enabledSongs !== undefined) setEnabledTracks(this.settings.enabledSongs);
    if (patch.song !== undefined || this.settings.song !== beforeSong) setSongChoice(this.settings.song);
    saveSettings(this.settings);
    this.publish();
  }

  /** Turn a playlist track on or off. The last track that is on stays on. */
  toggleSong(id: GameTrackId) {
    const next = toggleEnabled(this.settings.enabledSongs, id);
    const same = next.length === this.settings.enabledSongs.length
      && next.every((trackId, index) => trackId === this.settings.enabledSongs[index]);
    if (same) return;
    const pin = this.settings.song;
    const song = pin !== SHUFFLE_SONG && !next.includes(pin) ? SHUFFLE_SONG : pin;
    this.settings = { ...this.settings, enabledSongs: next, song };
    setEnabledTracks(next);
    if (song !== pin) setSongChoice(song);
    saveSettings(this.settings);
    this.publish();
  }

  /** Freeze the run while the pause menu is open, and let go of a held foot or neck. */
  holdPlay(held: boolean) {
    if (this.playHeld === held) return;
    this.playHeld = held;
    if (held) {
      this.engine.release('left');
      this.engine.release('right');
      this.engine.releaseNeck();
    }
    this.publish();
  }

  /** Crossfade to the next gameplay song. A pinned song moves to the next title. */
  changeSong() {
    const next = skipTrack();
    if (next === this.settings.song) return;
    this.settings = { ...this.settings, song: next };
    saveSettings(this.settings);
    this.publish();
  }

  setAppearance(appearance: Appearance) {
    this.save = updateAppearance(this.save, appearance);
    this.publish();
  }

  /** Free body choice from the first-launch picker or the wardrobe. */
  chooseBody(body: Appearance['body']) {
    this.save = choosePlayerBody(this.save, body);
    this.publish();
  }

  /** Buy or equip a boot. Returns false when broke/locked/unknown. */
  buyBoot(id: string): boolean {
    const result = buyOrEquipBoot(this.save, id);
    this.save = { ...this.save, ...result.locker };
    if (result.ok) persistSave(this.save);
    this.publish();
    return result.ok;
  }

  buyKit(id: string): boolean {
    const result = buyOrEquipKit(this.save, id);
    this.save = { ...this.save, ...result.locker };
    if (result.ok) persistSave(this.save);
    this.publish();
    return result.ok;
  }

  /** Preview a locked/unowned item without equipping it. */
  previewEquipment(opts: { kitId?: string | null; bootId?: string | null }) {
    this.publish(opts);
  }

  clearPreview() {
    this.publish();
  }

  async purchaseLaunchCollection(): Promise<PurchaseResult> {
    try {
      await this.billingReady;
    } catch {
      return this.failedBilling();
    }
    if (this.billingBusy) {
      return { outcome: 'busy', entitlement: { owned: false, source: 'none', verifiedAt: 0, transactionRef: null }, message: 'Purchase already in progress.' };
    }
    this.billingBusy = true;
    this.billingMessage = null;
    this.publish();
    try {
      const { result, locker } = await this.billing.purchase(this.save);
      this.save = { ...this.save, ...locker };
      if (result.outcome === 'purchased' || result.outcome === 'restored' || result.outcome === 'already_owned') {
        if (this.save.launchCollectionOwned) this.grantGuardUntil = Date.now() + 10_000;
        persistSave(this.save);
      }
      this.billingMessage = result.message
        ?? (result.outcome === 'failed' || result.outcome === 'unavailable' ? STORE_UNAVAILABLE_MESSAGE : null);
      return result;
    } catch {
      return this.failedBilling();
    } finally {
      this.billingBusy = false;
      this.publish();
    }
  }

  async restorePurchases(): Promise<PurchaseResult> {
    try {
      await this.billingReady;
    } catch {
      return this.failedBilling();
    }
    if (this.billingBusy) {
      return { outcome: 'busy', entitlement: { owned: false, source: 'none', verifiedAt: 0, transactionRef: null }, message: 'Please wait.' };
    }
    this.billingBusy = true;
    this.billingMessage = null;
    this.publish();
    try {
      const { result, locker } = await this.billing.restore(this.save);
      this.save = { ...this.save, ...locker };
      if (this.save.launchCollectionOwned) this.grantGuardUntil = Date.now() + 10_000;
      persistSave(this.save);
      this.billingMessage = result.message
        ?? (result.outcome === 'failed' || result.outcome === 'unavailable' ? STORE_UNAVAILABLE_MESSAGE : null);
      return result;
    } catch {
      return this.failedBilling();
    } finally {
      this.billingBusy = false;
      this.publish();
    }
  }
}

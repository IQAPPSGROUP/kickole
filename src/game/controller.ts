import { GameEngine, type EngineEvent, type Phase, type TrickKind } from '../engine/engine';
import type { Grade, Side } from '../engine/config';
import type { Appearance } from './appearance';
import { cheer, setBed, sfx, unlockAudio } from './audio';
import { crowdLevel, loudestCheer, milestoneHits, newlyOpenedTiers, type AudioProgress } from './audioPolicy';
import { composePlayerSkin, type Skin } from './skins';
import {
  buyOrEquipBoot,
  buyOrEquipKit,
  type ChallengeProgress,
} from './shop';
import {
  loadSave,
  loadSettings,
  persistSave,
  saveRun,
  saveSettings,
  updateAppearance,
  type SaveData,
  type Settings,
} from './storage';

export type ArmedTrick = Extract<TrickKind, 'aroundTheWorld' | 'thigh' | 'highFlick'>;

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
  neckHolding: boolean;
}

export interface Result {
  score: number;
  kickUps: number;
  bestStreak: number;
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
  private perfects = 0;
  private progress: AudioProgress = { streak: 0, kickUps: 0, perfects: 0 };
  private pendingCheers: string[] = [];

  constructor() {
    this.engine.prepare('menu');
    this.engine.on((e) => this.onEvent(e));
    this.snapshot = this.build();
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
        armedTrick: armed === 'aroundTheWorld' || armed === 'thigh' || armed === 'highFlick' ? armed : null,
        neckHolding: e.trick?.kind === 'neckStall'
          && (e.trick.phase === 'contact' || e.trick.phase === 'execute'),
      },
      save: this.save,
      settings: this.settings,
      skin: this.liveSkin(preview),
      result: this.result,
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
    this.syncBed();
  }

  /** Resume the audio graph from a tap or key press. */
  primeAudio() {
    this.syncBed();
    unlockAudio();
  }

  private vibrate(ms: number | number[]) {
    if (this.settings.vibration && 'vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch { /* unsupported */ }
    }
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
        this.vibrate(15);
        break;
      case 'kick': {
        if (e.alternate) this.runChallenges.alternateFoot += 1;
        if (e.stall) this.runChallenges.stalls += 1;
        if (e.grade === 'perfect') this.runChallenges.perfectTouch += 1;
        const high = this.engine.lastTrick?.kind === 'highFlick'
          && Math.abs(this.engine.lastTrick.time - this.engine.time) < 0.05;
        const label = e.stall ? 'FOOT STALL!' : high ? 'HIGH FLICK!' : e.grade.toUpperCase();
        this.show(e.stall ? 'stall' : e.grade, label, e.points);
        if (sound) { if (e.stall) sfx.stall(); sfx.kick(e.grade, e.streak); }
        this.vibrate(e.grade === 'perfect' ? [12, 20, 12] : 10);
        this.publish();
        break;
      }
      case 'miss':
        this.show('miss', 'MISS', 0);
        if (sound) sfx.miss();
        this.publish();
        break;
      case 'stallStart':
        this.publish();
        break;
      case 'trick':
        if (e.points > 0) {
          const label = e.kind === 'header' ? 'HEADER!'
            : e.kind === 'thigh' ? 'THIGH!'
              : e.kind === 'neckStall' ? 'NECK STALL!'
                : e.kind === 'aroundTheWorld' ? 'AROUND THE WORLD!'
                  : e.kind === 'highFlick' ? 'HIGH FLICK!'
                    : 'TRICK!';
          this.show('perfect', label, e.points);
        } else if (e.kind === 'neckStall' && e.phase === 'execute') {
          this.show('good', 'NECK RELEASE', 0);
        }
        this.publish();
        break;
      case 'combo':
        this.show('perfect', `${e.label} +${e.points}`, e.points);
        if (sound) sfx.kick('perfect', this.engine.streak);
        this.vibrate([10, 30, 10]);
        this.publish();
        break;
      case 'trickFail':
        this.show('miss', 'TRICK MISS', 0);
        this.publish();
        break;
      case 'drop':
        if (sound) sfx.drop();
        this.vibrate(80);
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
          newBest: r.newBest,
          rank: r.rank,
          coinsEarned: r.coinsEarned,
        };
        this.runChallenges = { alternateFoot: 0, stalls: 0, perfectTouch: 0 };
        this.publish();
        break;
      }
    }
  }

  refresh() { this.publish(); }

  tick(dt: number) {
    const before = this.engine.phase;
    this.engine.update(dt);
    if (before !== this.engine.phase) this.publish();
  }

  press(side: Side) {
    const e = this.engine;
    if (e.phase === 'menu' || e.phase === 'over' || e.phase === 'dropped') return;
    const before = e.phase;
    const beforeTrick = e.selectedTrick;
    e.press(side);
    if (before !== e.phase || beforeTrick !== e.selectedTrick || e.contact || e.trick) this.publish();
  }

  release(side: Side) {
    const was = this.engine.contact;
    this.engine.release(side);
    if (was && !this.engine.contact) this.publish();
  }

  attemptHeader() {
    if (this.engine.phase !== 'playing') return;
    this.engine.attemptHeader();
    this.publish();
  }

  pressNeck() {
    if (this.engine.phase !== 'playing') return;
    this.engine.pressNeck();
    this.publish();
  }

  releaseNeck() {
    this.engine.releaseNeck();
    this.publish();
  }

  armTrick(kind: ArmedTrick | null) {
    if (this.engine.phase !== 'playing' && this.engine.phase !== 'ready') return;
    this.engine.armTrick(kind);
    this.publish();
  }

  action() {
    const p = this.engine.phase;
    if (p === 'menu' || p === 'over') this.play();
    else if (p === 'ready') this.press('right');
  }

  play() {
    this.feedback = null;
    this.result = null;
    this.runChallenges = { alternateFoot: 0, stalls: 0, perfectTouch: 0 };
    this.perfects = 0;
    this.progress = { streak: 0, kickUps: 0, perfects: 0 };
    this.pendingCheers = [];
    this.engine.prepare('ready');
    this.publish();
  }

  home() {
    this.feedback = null;
    this.result = null;
    this.engine.prepare('menu');
    this.publish();
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.publish();
  }

  setAppearance(appearance: Appearance) {
    this.save = updateAppearance(this.save, appearance);
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
}

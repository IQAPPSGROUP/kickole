import { GameEngine, type EngineEvent, type Phase } from '../engine/engine';
import type { Grade, Side } from '../engine/config';
import { sfx } from './audio';
import { getSkin, type Skin } from './skins';
import { loadSave, loadSettings, saveRun, saveSettings, type SaveData, type Settings } from './storage';

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
}

export interface Result {
  score: number;
  kickUps: number;
  bestStreak: number;
  newBest: boolean;
  rank: number;
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

  private build(): Snapshot {
    const e = this.engine;
    return {
      hud: {
        phase: e.phase,
        score: e.stats.score,
        kickUps: e.stats.kickUps,
        streak: e.streak,
        feedback: this.feedback,
        stalling: e.contact?.kind === 'stall',
      },
      save: this.save,
      settings: this.settings,
      skin: getSkin(this.settings.skinId),
      result: this.result,
    };
  }

  private publish() {
    this.snapshot = this.build();
    this.listeners.forEach((l) => l());
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
    const sound = this.settings.sound;
    switch (e.type) {
      case 'launch':
        this.vibrate(15);
        break;
      case 'kick': {
        const label = e.stall ? 'FOOT STALL!' : e.grade.toUpperCase();
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
                  : 'TRICK!';
          this.show('perfect', label, e.points);
        }
        this.publish();
        break;
      case 'trickFail':
        this.publish();
        break;
      case 'drop':
        if (sound) sfx.drop();
        this.vibrate(80);
        this.publish();
        break;
      case 'over': {
        const s = this.engine.stats;
        const r = s.score > 0
          ? saveRun(this.save, { score: s.score, kickUps: s.kickUps, date: Date.now() })
          : { save: this.save, newBest: false, rank: -1 };
        this.save = r.save;
        this.result = { score: s.score, kickUps: s.kickUps, bestStreak: s.bestStreak, newBest: r.newBest, rank: r.rank };
        this.publish();
        break;
      }
    }
  }

  /** Re-publish the snapshot after the engine was changed from outside (dev inspector). */
  refresh() { this.publish(); }

  /** Called on each frame loop; publishes only when the phase-visible state changed. */
  tick(dt: number) {
    const before = this.engine.phase;
    this.engine.update(dt);
    if (before !== this.engine.phase) this.publish();
  }

  press(side: Side) {
    const e = this.engine;
    if (e.phase === 'menu' || e.phase === 'over' || e.phase === 'dropped') return;
    const before = e.phase;
    e.press(side);
    if (before !== e.phase) this.publish();
  }

  release(side: Side) {
    const was = this.engine.contact;
    this.engine.release(side);
    if (was && !this.engine.contact) this.publish();
  }

  /** Space bar / generic action. */
  action() {
    const p = this.engine.phase;
    if (p === 'menu' || p === 'over') this.play();
    else if (p === 'ready') this.press('right');
  }

  play() {
    this.feedback = null;
    this.result = null;
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
}

import { GameEngine, type EngineEvent, type Phase } from '../engine/engine';
import { DEFAULT_CONFIG, type Grade, type Side } from '../engine/config';
import { music, sfx } from './audio';
import { buyOrEquip, getBoot } from './boots';
import { calledFootBonus } from './called-foot';
import { isCheerMilestone, milestoneJustCrossed } from './milestones';
import { kickClipsBeachBall } from './set-dressing';
import { getSkin, type Skin } from './skins';
import { loadSave, loadSettings, persistSave, saveRun, saveSettings, type SaveData, type Settings } from './storage';
import { SHOWER_SECONDS, SHOWER_STREAK, composeWindows } from './windows';
import { fx } from '../scene/fx';

export interface Feedback {
  id: number;
  kind: Grade | 'stall' | 'milestone';
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
  private kickUpsSeen = 0;
  private perfectStreak = 0;
  private showerLeft = 0;
  private showerArmed = true;
  private poppedLoop = -1;

  constructor() {
    this.engine.prepare('menu');
    this.engine.on((e) => this.onEvent(e));
    this.applyWindows();
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

  /** Boots widen the base windows. A shower then tightens that result. The base constants stay put. */
  private applyWindows() {
    const boot = getBoot(this.save.equippedBoot);
    const timing = composeWindows(DEFAULT_CONFIG.timing, boot, this.showerLeft > 0);
    this.engine.config.timing.perfectMs = timing.perfectMs;
    this.engine.config.timing.goodMs = timing.goodMs;
    this.engine.config.timing.poorMs = timing.poorMs;
  }

  private resetRunFeel() {
    this.kickUpsSeen = 0;
    this.perfectStreak = 0;
    this.showerLeft = 0;
    this.showerArmed = true;
    music.setTarget(0);
    this.applyWindows();
  }

  private onEvent(e: EngineEvent) {
    const sound = this.settings.sound;
    switch (e.type) {
      case 'launch':
        this.vibrate(15);
        break;
      case 'kick': {
        const kicks = this.engine.stats.kickUps;
        const beforeUps = kicks < this.kickUpsSeen ? 0 : this.kickUpsSeen;
        this.kickUpsSeen = kicks;
        const milestone = milestoneJustCrossed(beforeUps, kicks);
        const called = calledFootBonus(kicks, e.side);
        let pop = 0;
        if (this.settings.sceneId === 'beach') {
          const b = this.engine.ball;
          const clip = kickClipsBeachBall({
            x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz,
            gravity: this.engine.gravity, time: fx.propTime,
          }, this.poppedLoop);
          pop = clip.bonus;
          if (pop > 0) {
            this.poppedLoop = clip.loop;
            fx.beachPop = clip.loop;
          }
        }
        const extra = called + pop;
        if (extra > 0) this.engine.stats.score += extra;
        if (e.grade === 'perfect') this.perfectStreak += 1;
        music.setTarget(this.perfectStreak);
        if (this.engine.streak >= SHOWER_STREAK && this.showerArmed) {
          this.showerLeft = SHOWER_SECONDS;
          this.showerArmed = false;
        }
        this.applyWindows();
        const total = e.points + extra;
        if (milestone !== null) {
          this.show('milestone', `${milestone} KICK-UPS`, total);
          fx.pulse = 1;
          if (this.settings.quality !== 'low') fx.milestoneBurst += 1;
          if (sound) sfx.milestone();
          if (isCheerMilestone(milestone)) {
            fx.cheer = 1;
            if (sound) sfx.cheer();
          }
        } else {
          const label = e.stall ? 'FOOT STALL!' : e.grade.toUpperCase();
          this.show(e.stall ? 'stall' : e.grade, called > 0 ? `${label} +${called}` : label, total);
        }
        if (sound) {
          if (e.stall) sfx.stall();
          sfx.kick(e.grade, e.streak);
          if (pop > 0) sfx.pop();
        }
        this.vibrate(e.grade === 'perfect' ? [12, 20, 12] : 10);
        this.publish();
        break;
      }
      case 'miss':
        this.show('miss', 'MISS', 0);
        this.perfectStreak = 0;
        music.setTarget(0);
        this.showerLeft = 0;
        this.showerArmed = true;
        this.applyWindows();
        if (sound) sfx.miss();
        this.publish();
        break;
      case 'stallStart':
        this.publish();
        break;
      case 'drop':
        this.perfectStreak = 0;
        music.setTarget(0);
        this.showerLeft = 0;
        this.showerArmed = true;
        this.applyWindows();
        if (sound) sfx.drop();
        this.vibrate(80);
        this.publish();
        break;
      case 'over': {
        this.showerLeft = 0;
        this.applyWindows();
        const s = this.engine.stats;
        const r = s.score > 0
          ? saveRun(this.save, { score: s.score, kickUps: s.kickUps, date: Date.now() })
          : { save: this.save, newBest: false, rank: -1 };
        this.save = r.save;
        this.result = { score: s.score, kickUps: s.kickUps, bestStreak: s.bestStreak, newBest: r.newBest, rank: r.rank };
        this.publish();
        break;
      }
      default: {
        const unhandled: never = e;
        void unhandled;
      }
    }
  }

  /** Re-publish the snapshot after the engine was changed from outside (dev inspector). */
  refresh() { this.publish(); }

  /** Called on each frame loop; publishes only when the phase-visible state changed. */
  tick(dt: number) {
    if (this.showerLeft > 0) {
      this.showerLeft = Math.max(0, this.showerLeft - dt);
      if (this.showerLeft === 0) this.showerArmed = this.engine.streak < SHOWER_STREAK;
    }
    this.applyWindows();
    const before = this.engine.phase;
    this.engine.update(dt);
    const showerTarget = this.showerLeft > 0 ? 1 : 0;
    fx.shower = showerTarget > fx.shower ? Math.min(1, fx.shower + dt * 2.4) : Math.max(0, fx.shower - dt * 1.8);
    if (before !== this.engine.phase) this.publish();
  }

  press(side: Side) {
    music.sync(this.settings.sound);
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
    music.sync(this.settings.sound);
    const p = this.engine.phase;
    if (p === 'menu' || p === 'over') this.play();
    else if (p === 'ready') this.press('right');
  }

  play() {
    this.feedback = null;
    this.result = null;
    this.resetRunFeel();
    this.engine.prepare('ready');
    music.sync(this.settings.sound);
    this.publish();
  }

  home() {
    this.feedback = null;
    this.result = null;
    this.resetRunFeel();
    this.engine.prepare('menu');
    music.sync(this.settings.sound);
    this.publish();
  }

  updateSettings(patch: Partial<Settings>) {
    const next: Settings = { ...this.settings, ...patch };
    if (typeof patch.nickname === 'string') {
      next.nickname = patch.nickname.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 12);
    }
    this.settings = next;
    saveSettings(this.settings);
    music.sync(this.settings.sound);
    this.publish();
  }

  /** Buy a pair the balance can cover, or equip one already owned. Returns false when the coins are short. */
  buyBoot(id: string): boolean {
    const result = buyOrEquip(this.save, id);
    if (!result.ok) return false;
    this.save = {
      ...this.save,
      coins: result.locker.coins,
      ownedBoots: result.locker.ownedBoots,
      equippedBoot: result.locker.equippedBoot,
    };
    persistSave(this.save);
    this.applyWindows();
    music.sync(this.settings.sound);
    this.publish();
    return true;
  }
}

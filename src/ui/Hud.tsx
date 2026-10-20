import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameController, Hud as HudState, ArmedTrick } from '../game/controller';
import type { ActivePrompt, PromptGesture } from '../game/prompts';
import type { Side } from '../engine/config';
import { streakMultiplier } from '../engine/scoring';
import { beatClock } from '../game/audio';
import { prefersReducedMotion } from '../scene/juice';
import { fanLayout } from './fanLayout';
import { applyNeckPointer, classifyTrickRelease, type NeckPointerState } from './trickInput';

export function Hud({
  hud,
  controller,
  onSkipCelebration,
  onScoreboard,
}: {
  hud: HudState;
  controller?: GameController;
  onSkipCelebration?: () => void;
  onScoreboard?: () => void;
}) {
  const f = hud.feedback;
  const combo = streakMultiplier(hud.streak);
  const showBoard = onScoreboard && (hud.phase === 'ready' || hud.phase === 'playing');
  return (
    <div className="hud">
      <div className="hud-bar">
        <div className="hud-top">
          <div className="score" key={hud.score}>{hud.score}</div>
          <div className="hud-sub">
            <span>KICK-UPS <b>{hud.kickUps}</b></span>
            {combo > 1 && <span className="combo" key={combo}>x{combo}</span>}
          </div>
        </div>
        {showBoard && (
          <button
            type="button"
            className="scoreboard-btn"
            aria-label="Scoreboard"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); onScoreboard?.(); }}
          >
            <TrophyIcon />
          </button>
        )}
      </div>
      {hud.prompt && controller && <PromptBanner prompt={hud.prompt} controller={controller} />}
      {f && hud.phase !== 'over' && (
        <div className={`feedback ${f.kind}`} key={f.id}>
          {f.text}
          {f.points > 0 && <small>+{f.points}</small>}
        </div>
      )}
      {hud.phase === 'ready' && (
        <div className="tap-start">FIND YOUR RHYTHM</div>
      )}
      {hud.stalling && <div className="stall-hint">RELEASE</div>}
      {hud.neckHolding && <div className="stall-hint">RELEASE</div>}
      {hud.armedTrick && hud.phase === 'playing' && (
        <div className="trick-armed">{armedLabel(hud.armedTrick)}</div>
      )}
      {hud.celebrating && (
        <button
          type="button"
          className="celebrate-skip"
          onClick={(e) => { e.stopPropagation(); onSkipCelebration?.(); }}
        >
          SKIP
        </button>
      )}
    </div>
  );
}

function PromptBanner({ prompt, controller }: { prompt: ActivePrompt; controller: GameController }) {
  const ring = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const reduced = prefersReducedMotion();
    let frame = 0;
    const tick = () => {
      const el = ring.current;
      if (el) {
        const left = Math.max(0, prompt.startedAt + prompt.windowSec - controller.engine.time);
        const fraction = prompt.windowSec > 0 ? Math.max(0, Math.min(1, left / prompt.windowSec)) : 0;
        el.style.strokeDashoffset = String(100 - fraction * 100);
        if (prompt.beat && !reduced) {
          const { pulse } = beatClock();
          el.style.opacity = String(0.45 + pulse * 0.55);
        } else {
          el.style.opacity = '1';
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [controller, prompt]);
  const chain = prompt.chainNeed > 1 ? ` ${prompt.chainCount}/${prompt.chainNeed}` : '';
  const call = `${prompt.call}${chain}`;
  return (
    <div className="prompt-banner" key={`${prompt.id}:${prompt.startedAt}`}>
      <svg className="prompt-filters" aria-hidden width="0" height="0">
        <filter id="prompt-spray" x="-8%" y="-20%" width="116%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.4 -0.55" result="speck" />
          <feComposite in="speck" in2="SourceAlpha" operator="in" />
        </filter>
      </svg>
      <div className="prompt-bounce">
        <GraffitiText text={call} className={call.length > 16 ? 'graffiti prompt-call is-long' : 'graffiti prompt-call'} />
        <svg className="prompt-ring" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="14" />
          <circle ref={ring} cx="18" cy="18" r="14" pathLength={100} />
        </svg>
      </div>
    </div>
  );
}

const GRAFFITI_TILT = [-4, 3, -2, 4, -3, 2, -4, 2, 3, -2, 4, -1] as const;

function graffitiGlyphs(text: string) {
  return [...text].map((ch, index) => {
    const tilt = GRAFFITI_TILT[index % GRAFFITI_TILT.length] ?? 0;
    const lift = (index % 3) - 1;
    return (
      <span className="prompt-ch" key={`${index}:${ch}`} style={{ transform: `rotate(${tilt}deg) translateY(${lift}px)` }}>
        {ch === ' ' ? '\u00A0' : ch}
      </span>
    );
  });
}

function GraffitiText({ text, className }: { text: string; className: string }) {
  return (
    <span className={className}>
      <span className="prompt-shine" aria-hidden="true">{graffitiGlyphs(text)}</span>
      <span className="prompt-ink" aria-hidden="true">{graffitiGlyphs(text)}</span>
      <span className="prompt-face">{graffitiGlyphs(text)}</span>
      <span className="prompt-spray" aria-hidden="true">{graffitiGlyphs(text)}</span>
    </span>
  );
}

export function ClueMark({ gesture }: { gesture: PromptGesture }) {
  return (
    <span className={`ghost-hand ghost-${gesture}`} aria-hidden>
      <i />
    </span>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 4h10v2.2a4.2 4.2 0 0 1-3.1 4 4.2 4.2 0 0 1-3.8 0A4.2 4.2 0 0 1 7 6.2V4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M7 6H4.8A2.8 2.8 0 0 0 7.2 9.2M17 6h2.2A2.8 2.8 0 0 1 16.8 9.2M12 10.4V14M9 20h6M8.5 17.5h7l-.6-3.5h-5.8l-.6 3.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function armedLabel(kind: ArmedTrick) {
  switch (kind) {
    case 'aroundTheWorld': return 'ATW';
    case 'thigh': return 'THIGH';
    case 'highFlick': return 'FLICK';
    case 'groove': return 'GROOVE';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Visual beat, including while the steel band is muted. */
function BeatRing({ active }: { active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const reduced = prefersReducedMotion();
    const tick = () => {
      const el = ref.current;
      if (el) {
        if (reduced) {
          el.style.opacity = '0.85';
          el.style.transform = 'scale(1)';
        } else {
          const { pulse } = beatClock();
          el.style.opacity = String(0.25 + pulse * 0.75);
          el.style.transform = `scale(${0.72 + pulse * 0.38})`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return <span ref={ref} className="beat-ring" aria-hidden />;
}

type TrickButtonKind = 'head' | 'neck' | ArmedTrick;

function trickName(kind: TrickButtonKind): string {
  switch (kind) {
    case 'head': return 'HEAD';
    case 'neck': return 'NECK';
    case 'aroundTheWorld': return 'ATW';
    case 'thigh': return 'THIGH';
    case 'highFlick': return 'FLICK';
    case 'groove': return 'GROOVE';
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function PowerRing({ controller, side }: { controller: GameController; side: Side }) {
  const ref = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const charge = controller.engine.kickCharge;
      const el = ref.current;
      if (el) {
        const power = charge?.side === side ? charge.power : 0;
        el.style.strokeDashoffset = String(100 - power * 100);
        el.style.opacity = power > 0.02 ? '1' : '0';
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [controller, side]);
  return (
    <svg className="power-ring" viewBox="0 0 36 36" aria-hidden>
      <circle ref={ref} cx="18" cy="18" r="15.5" pathLength={100} />
    </svg>
  );
}

function bindFoot(controller: GameController, side: Side) {
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      controller.press(side, e.pointerId);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      controller.release(side);
    },
    onPointerCancel: () => controller.release(side),
  };
}

type FanSlot = 'top' | 'diag' | 'side';

interface FanTrick {
  kind: TrickButtonKind;
  cls: string;
  label: string;
  control: ActivePrompt['control'];
  slot: FanSlot;
}

const LEFT_FAN: readonly FanTrick[] = [
  { kind: 'head', cls: 'ps-head', label: 'Header', control: 'head', slot: 'top' },
  { kind: 'neck', cls: 'ps-neck', label: 'Neck stall, tap or hold', control: 'neck', slot: 'diag' },
  { kind: 'aroundTheWorld', cls: 'ps-atw', label: 'Around the world', control: 'atw', slot: 'side' },
];

const RIGHT_FAN: readonly FanTrick[] = [
  { kind: 'highFlick', cls: 'ps-flick', label: 'High flick', control: 'flick', slot: 'top' },
  { kind: 'thigh', cls: 'ps-thigh', label: 'Thigh touch', control: 'thigh', slot: 'diag' },
  { kind: 'groove', cls: 'ps-groove', label: 'Groove, dance and keep the ball up', control: 'groove', slot: 'side' },
];

function useFanStyle(): CSSProperties {
  const [layout, setLayout] = useState(() => fanLayout(390));
  useEffect(() => {
    const apply = () => {
      const app = document.querySelector('.app');
      const read = (name: string) => {
        if (!app) return 0;
        const value = parseFloat(getComputedStyle(app).getPropertyValue(name));
        return Number.isFinite(value) ? value : 0;
      };
      setLayout(fanLayout(window.innerWidth, read('--sat-l'), read('--sat-r'), read('--sat-b')));
    };
    apply();
    window.addEventListener('resize', apply);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      viewport?.removeEventListener('resize', apply);
    };
  }, []);
  return {
    '--fan-d': `${layout.d}px`,
    '--fan-dx': `${layout.dx}px`,
    '--fan-dy': `${layout.dy}px`,
    '--fan-inset-l': `${layout.insetLeft}px`,
    '--fan-inset-r': `${layout.insetRight}px`,
    '--fan-inset-b': `${layout.insetBottom}px`,
  } as CSSProperties;
}

export function TouchZones({ controller }: { controller: GameController }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const fanStyle = useFanStyle();
  const armed = snap.hud.armedTrick;
  const playing = snap.hud.phase === 'playing';
  const clue = snap.hud.prompt;
  const clueOn = (control: ActivePrompt['control']) => clue?.control === control;
  const neckPtr = useRef<NeckPointerState>({ pointerId: null });
  const drag = useRef<{ id: number; x: number; y: number; kind: TrickButtonKind } | null>(null);

  useEffect(() => {
    const clear = () => {
      neckPtr.current = { pointerId: null };
      controller.releaseNeck();
    };
    const end = (e: PointerEvent) => {
      const next = applyNeckPointer(neckPtr.current, { type: e.type === 'pointercancel' ? 'pointercancel' : 'pointerup', pointerId: e.pointerId }, controller.engine.phase);
      if (next.action !== 'release') return;
      neckPtr.current = next.state;
      drag.current = null;
      controller.releaseNeck();
    };
    window.addEventListener('blur', clear);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('blur', clear);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [controller]);

  const fire = (kind: TrickButtonKind) => {
    switch (kind) {
      case 'head':
        controller.attemptHeader();
        break;
      case 'neck':
        break;
      case 'aroundTheWorld':
      case 'thigh':
      case 'highFlick':
      case 'groove':
        controller.playTrick(kind);
        break;
      default: {
        const exhaustive: never = kind;
        void exhaustive;
      }
    }
  };

  const onTrickDown = (kind: TrickButtonKind) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, kind };
    if (kind !== 'neck') return;
    const next = applyNeckPointer(neckPtr.current, { type: 'pointerdown', pointerId: e.pointerId }, controller.engine.phase);
    neckPtr.current = next.state;
    if (next.action === 'locked') controller.noteLockedTrick();
    else if (next.action === 'press') controller.pressNeck();
  };

  const onTrickUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const start = drag.current;
    drag.current = null;
    if (!start || start.id !== e.pointerId) return;
    if (start.kind === 'neck') {
      const next = applyNeckPointer(
        neckPtr.current,
        { type: e.type === 'pointercancel' ? 'pointercancel' : 'pointerup', pointerId: e.pointerId },
        controller.engine.phase,
      );
      neckPtr.current = next.state;
      if (next.action === 'release') controller.releaseNeck();
      return;
    }
    const decision = classifyTrickRelease({
      phase: controller.engine.phase,
      dx: e.clientX - start.x,
      dy: e.clientY - start.y,
    });
    if (decision === 'ignore') return;
    if (decision === 'locked') {
      controller.noteLockedTrick();
      return;
    }
    fire(start.kind);
  };

  const trickButton = (trick: FanTrick) => {
    const on = trick.kind !== 'head' && trick.kind !== 'neck' && armed === trick.kind;
    const neckOn = trick.kind === 'neck' && snap.hud.neckHolding;
    return (
      <button
        key={trick.kind}
        type="button"
        className={`trick-btn fan-${trick.slot} ${trick.cls}${on || neckOn ? ' on' : ''}${!playing ? ' locked' : ''}${clueOn(trick.control) ? ' clue' : ''}`}
        aria-disabled={!playing}
        aria-pressed={trick.kind === 'head' ? undefined : on || neckOn}
        aria-label={playing ? trick.label : `${trick.label}, locked until you kick`}
        onPointerDown={onTrickDown(trick.kind)}
        onPointerUp={onTrickUp}
        onPointerCancel={onTrickUp}
        onLostPointerCapture={(e) => {
          if (trick.kind === 'neck') {
            const next = applyNeckPointer(neckPtr.current, { type: 'lostpointercapture', pointerId: e.pointerId }, controller.engine.phase);
            neckPtr.current = next.state;
            return;
          }
          drag.current = null;
        }}
      >
        {trick.kind === 'groove' && <BeatRing active={playing || Boolean(clue?.beat)} />}
        {clueOn(trick.control) && clue && <ClueMark gesture={clue.gesture} />}
        <span className="trick-label">{trickName(trick.kind)}</span>
      </button>
    );
  };

  return (
    <div className="zones" style={fanStyle}>
      <p className="trick-help">H header · N neck · T thigh · F flick · W atw · G groove · Esc cancel</p>
      <div className="fan fan-left" role="group" aria-label="Left foot and tricks">
        {LEFT_FAN.map(trickButton)}
        <button type="button" className={`foot-btn left${clueOn('feet') ? ' clue' : ''}`} aria-label="Left foot" {...bindFoot(controller, 'left')}>
          <PowerRing controller={controller} side="left" />
          <span className="foot-btn-label">LEFT</span>
        </button>
      </div>
      <div className="fan fan-right" role="group" aria-label="Right foot and tricks">
        {RIGHT_FAN.map(trickButton)}
        <button type="button" className={`foot-btn right${clueOn('feet') ? ' clue' : ''}`} aria-label="Right foot" {...bindFoot(controller, 'right')}>
          <PowerRing controller={controller} side="right" />
          {clueOn('feet') && clue && <ClueMark gesture={clue.gesture} />}
          <span className="foot-btn-label">RIGHT</span>
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameController, Hud as HudState, ArmedTrick } from '../game/controller';
import type { ActivePrompt, PromptGesture } from '../game/prompts';
import type { Side } from '../engine/config';
import { beatClock } from '../game/audio';
import { prefersReducedMotion } from '../scene/juice';
import { classifyTrickRelease } from './trickInput';

export function Hud({
  hud,
  controller,
  onSkipCelebration,
}: {
  hud: HudState;
  controller?: GameController;
  onSkipCelebration?: () => void;
}) {
  const f = hud.feedback;
  return (
    <div className="hud">
      <div className="hud-top">
        <span className="score-label">YOUR RUN</span>
        <div className="score" key={hud.score}>{hud.score}</div>
        <div className="hud-sub">
          <span>KICK-UPS <b>{hud.kickUps}</b></span>
          {hud.streak >= 2 && <span className="combo" key={hud.streak}>COMBO x{hud.streak}</span>}
        </div>
      </div>
      {hud.prompt && controller && <PromptBanner prompt={hud.prompt} controller={controller} />}
      {hud.hintTip && <div className="hint-tip">{hud.hintTip}</div>}
      {f && hud.phase !== 'over' && (
        <div className={`feedback ${f.kind}`} key={f.id}>
          {f.text}
          {f.points > 0 && <small>+{f.points}</small>}
        </div>
      )}
      {hud.phase === 'ready' && (
        <div className="tap-start">FIND YOUR RHYTHM<small>Tap either side to start · Tricks unlock in play</small></div>
      )}
      {hud.stalling && <div className="stall-hint">HOLD… RELEASE TO FLICK!</div>}
      {hud.neckHolding && <div className="stall-hint">NECK STALL · RELEASE TO FLICK</div>}
      {hud.armedTrick && hud.phase === 'playing' && (
        <div className="trick-armed">
          {armedLabel(hud.armedTrick)} {hud.trickQueued ? 'LINING UP' : 'ARMED'}
        </div>
      )}
      {hud.celebrating && (
        <button
          type="button"
          className="celebrate-skip"
          onClick={(e) => { e.stopPropagation(); onSkipCelebration?.(); }}
        >
          {hud.celebrationLabel} · TAP TO SKIP
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
  return (
    <div className="prompt-banner" key={`${prompt.id}:${prompt.startedAt}`}>
      <svg className="prompt-ring" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r="15.5" />
        <circle ref={ring} cx="18" cy="18" r="15.5" pathLength={100} />
      </svg>
      <span>
        <b>{prompt.call}{chain}</b>
        <small>{prompt.tip}</small>
      </span>
    </div>
  );
}

export function ClueMark({ gesture }: { gesture: PromptGesture }) {
  const label = gesture === 'hold' ? 'Hold' : gesture === 'swipe' ? 'Swipe' : 'Tap';
  return (
    <span className={`ghost-hand ghost-${gesture}`} aria-hidden>
      <i />
      <em>{label}</em>
    </span>
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

function TrickIcon({ kind }: { kind: TrickButtonKind }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true as const, className: 'trick-icon' };
  switch (kind) {
    case 'head':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" fill="currentColor" />
          <path d="M8 20c.4-3 2-4.6 4-4.6s3.6 1.6 4 4.6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'aroundTheWorld':
      return (
        <svg {...common}>
          <path d="M12 5a7 7 0 1 0 6.2 3.8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M15 4.5h4.2V9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'neck':
      return (
        <svg {...common}>
          <path d="M8 5h8M9 5v6.5c0 2.8 1.3 4.5 3 4.5s3-1.7 3-4.5V5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'highFlick':
      return (
        <svg {...common}>
          <path d="M12 19V7M7.5 11 12 6.5 16.5 11" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'groove':
      return (
        <svg {...common}>
          <path d="M9 18V8l8-2v10" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="7.2" cy="18" r="1.8" fill="currentColor" />
          <circle cx="15.2" cy="16" r="1.8" fill="currentColor" />
        </svg>
      );
    case 'thigh':
      return (
        <svg {...common}>
          <path d="M9 4v8l-2 8M15 4v7l3 9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

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
      e.currentTarget.setPointerCapture?.(e.pointerId);
      controller.press(side);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      controller.release(side);
    },
    onPointerCancel: () => controller.release(side),
    onLostPointerCapture: () => controller.release(side),
  };
}

const TRICKS: ReadonlyArray<{ kind: TrickButtonKind; cls: string; label: string; control: ActivePrompt['control'] }> = [
  { kind: 'head', cls: 'ps-head', label: 'Header', control: 'head' },
  { kind: 'aroundTheWorld', cls: 'ps-atw', label: 'Around the world', control: 'atw' },
  { kind: 'neck', cls: 'ps-neck', label: 'Neck stall, tap or hold', control: 'neck' },
  { kind: 'highFlick', cls: 'ps-flick', label: 'High flick', control: 'flick' },
  { kind: 'groove', cls: 'ps-groove', label: 'Groove, dance and keep the ball up', control: 'groove' },
  { kind: 'thigh', cls: 'ps-thigh', label: 'Thigh touch', control: 'thigh' },
];

export function TouchZones({ controller }: { controller: GameController }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const armed = snap.hud.armedTrick;
  const playing = snap.hud.phase === 'playing';
  const clue = snap.hud.prompt;
  const clueOn = (control: ActivePrompt['control']) => clue?.control === control;
  const neckPtr = useRef<number | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; kind: TrickButtonKind } | null>(null);

  useEffect(() => {
    const clear = () => controller.releaseNeck();
    window.addEventListener('blur', clear);
    return () => window.removeEventListener('blur', clear);
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
    if (kind === 'neck') {
      neckPtr.current = e.pointerId;
      if (!playing) controller.noteLockedTrick();
      else controller.pressNeck();
    }
  };

  const onTrickUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const start = drag.current;
    drag.current = null;
    if (!start || start.id !== e.pointerId) return;
    const decision = classifyTrickRelease({
      phase: controller.engine.phase,
      dx: e.clientX - start.x,
      dy: e.clientY - start.y,
    });
    if (start.kind === 'neck') {
      if (neckPtr.current !== null && e.pointerId !== neckPtr.current) return;
      neckPtr.current = null;
      controller.releaseNeck();
      return;
    }
    if (decision === 'ignore') return;
    if (decision === 'locked') {
      controller.noteLockedTrick();
      return;
    }
    fire(start.kind);
  };

  return (
    <div className="zones">
      <p className="trick-help">H header · N neck · T thigh · F flick · W atw · G groove · Esc cancel</p>
      <div className="foot-row">
        <button type="button" className={`foot-btn left${clueOn('feet') ? ' clue' : ''}`} aria-label="Left foot" {...bindFoot(controller, 'left')}>
          <PowerRing controller={controller} side="left" />
          <span className="foot-btn-mark">L</span>
          <span className="foot-btn-label">LEFT</span>
        </button>
        <button type="button" className={`foot-btn right${clueOn('feet') ? ' clue' : ''}`} aria-label="Right foot" {...bindFoot(controller, 'right')}>
          <PowerRing controller={controller} side="right" />
          {clueOn('feet') && clue && <ClueMark gesture={clue.gesture} />}
          <span className="foot-btn-mark">R</span>
          <span className="foot-btn-label">RIGHT</span>
        </button>
      </div>
      <div className="trick-bar" role="toolbar" aria-label="Freestyle tricks">
        {TRICKS.map((trick) => {
          const on = trick.kind !== 'head' && trick.kind !== 'neck' && armed === trick.kind;
          const neckOn = trick.kind === 'neck' && snap.hud.neckHolding;
          return (
            <button
              key={trick.kind}
              type="button"
              className={`trick-btn ${trick.cls}${on || neckOn ? ' on' : ''}${!playing ? ' locked' : ''}${clueOn(trick.control) ? ' clue' : ''}`}
              aria-disabled={!playing}
              aria-pressed={trick.kind === 'head' ? undefined : on || neckOn}
              aria-label={playing ? trick.label : `${trick.label}, locked until you kick`}
              onPointerDown={onTrickDown(trick.kind)}
              onPointerUp={onTrickUp}
              onPointerCancel={onTrickUp}
              onLostPointerCapture={() => {
                if (trick.kind === 'neck') {
                  neckPtr.current = null;
                  controller.releaseNeck();
                }
                drag.current = null;
              }}
            >
              {trick.kind === 'groove' && <BeatRing active={playing || Boolean(clue?.beat)} />}
              {clueOn(trick.control) && clue && <ClueMark gesture={clue.gesture} />}
              <TrickIcon kind={trick.kind} />
              <span className="trick-label">{playing ? trickName(trick.kind) : 'LOCKED'}</span>
              {trick.kind === 'neck' && playing && <small className="trick-sub">HOLD</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

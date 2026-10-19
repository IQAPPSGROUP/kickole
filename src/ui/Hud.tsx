import { useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameController, Hud as HudState, ArmedTrick } from '../game/controller';
import type { Side } from '../engine/config';
import { beatClock } from '../game/audio';
import { prefersReducedMotion } from '../scene/juice';

export function Hud({ hud, onSkipCelebration }: { hud: HudState; onSkipCelebration?: () => void }) {
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
        <div className="trick-armed">{armedLabel(hud.armedTrick)} ARMED · TAP L / R</div>
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

export function TouchZones({ controller }: { controller: GameController }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const armed = snap.hud.armedTrick;
  const playing = snap.hud.phase === 'playing';
  const neckPtr = useRef<number | null>(null);

  // Ensure a stuck neck hold cannot survive a lost finger / tab blur.
  useEffect(() => {
    const clear = () => controller.releaseNeck();
    window.addEventListener('blur', clear);
    return () => window.removeEventListener('blur', clear);
  }, [controller]);

  const onNeckDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    neckPtr.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    controller.pressNeck();
  };
  const onNeckUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (neckPtr.current !== null && e.pointerId !== neckPtr.current) return;
    neckPtr.current = null;
    controller.releaseNeck();
  };

  return (
    <div className="zones">
      <p className="trick-help">H header · N neck · T thigh · F flick · W atw · G groove · Esc cancel</p>
      <div className="foot-row">
        <button type="button" className="foot-btn left" aria-label="Left foot" {...bindFoot(controller, 'left')}>
          <span className="foot-btn-mark">L</span>
          <span className="foot-btn-label">LEFT</span>
        </button>
        <div className="trick-bar" role="toolbar" aria-label="Freestyle tricks">
          <button
            type="button"
            className="trick-btn ps-head"
            disabled={!playing}
            aria-label="Header"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); controller.attemptHeader(); }}
          >
            HEAD
          </button>
          <button
            type="button"
            className={`trick-btn ps-atw ${armed === 'aroundTheWorld' ? 'on' : ''}`}
            disabled={!playing}
            aria-label="Around the world"
            aria-pressed={armed === 'aroundTheWorld'}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); controller.armTrick('aroundTheWorld'); }}
          >
            ATW
          </button>
          <button
            type="button"
            className={`trick-btn ps-neck ${snap.hud.neckHolding ? 'on' : ''}`}
            disabled={!playing}
            aria-label="Neck stall"
            onPointerDown={onNeckDown}
            onPointerUp={onNeckUp}
            onPointerCancel={onNeckUp}
            onLostPointerCapture={() => { neckPtr.current = null; controller.releaseNeck(); }}
          >
            NECK
          </button>
          <button
            type="button"
            className={`trick-btn ps-flick ${armed === 'highFlick' ? 'on' : ''}`}
            disabled={!playing}
            aria-label="High flick"
            aria-pressed={armed === 'highFlick'}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); controller.armTrick('highFlick'); }}
          >
            FLICK
          </button>
          <button
            type="button"
            className={`trick-btn ps-groove ${armed === 'groove' ? 'on' : ''}`}
            disabled={!playing}
            aria-label="Groove, dance and keep the ball up"
            aria-pressed={armed === 'groove'}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); controller.armTrick('groove'); }}
          >
            <BeatRing active={playing} />
            GROOVE
          </button>
          <button
            type="button"
            className={`trick-btn ps-thigh ${armed === 'thigh' ? 'on' : ''}`}
            disabled={!playing}
            aria-label="Thigh touch"
            aria-pressed={armed === 'thigh'}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); controller.armTrick('thigh'); }}
          >
            THIGH
          </button>
        </div>
        <button type="button" className="foot-btn right" aria-label="Right foot" {...bindFoot(controller, 'right')}>
          <span className="foot-btn-mark">R</span>
          <span className="foot-btn-label">RIGHT</span>
        </button>
      </div>
    </div>
  );
}

import type { PointerEvent } from 'react';
import type { GameController, Hud as HudState } from '../game/controller';
import type { Side } from '../engine/config';

export function Hud({ hud }: { hud: HudState }) {
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
        <div className="tap-start">FIND YOUR RHYTHM<small>Tap either side to start</small></div>
      )}
      {hud.stalling && <div className="stall-hint">HOLD… RELEASE TO FLICK!</div>}
    </div>
  );
}

export function TouchZones({ controller }: { controller: GameController }) {
  const bind = (side: Side) => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      controller.press(side);
    },
    onPointerUp: () => controller.release(side),
    onPointerCancel: () => controller.release(side),
    onLostPointerCapture: () => controller.release(side),
  });
  return (
    <div className="zones">
      <div className="zone left" {...bind('left')}><span>LEFT FOOT</span></div>
      <div className="zone right" {...bind('right')}><span>RIGHT FOOT</span></div>
    </div>
  );
}

import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { GameController } from '../game/controller';
import { GameCanvas } from '../scene/GameCanvas';
import { fx } from '../scene/fx';
import { Hud, TouchZones } from './Hud';
import { Home, GameOver, SettingsScreen } from './Screens';

// Development-only animation inspector; never bundled into production builds.
const INSPECT = import.meta.env.DEV && new URLSearchParams(window.location.search).has('inspect');
const InspectorPanel = INSPECT ? lazy(() => import('./InspectorPanel').then((m) => ({ default: m.InspectorPanel }))) : null;

export function App() {
  const controller = useMemo(() => new GameController(), []);
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [showSettings, setShowSettings] = useState(false);
  if (import.meta.env.DEV) (window as unknown as { __kicky?: GameController }).__kicky = controller;
  const { phase } = snap.hud;
  if (import.meta.env.DEV) void import('../scene/inspector').then((m) => { (window as unknown as { __inspectorState?: unknown }).__inspectorState = m.inspector; });

  useEffect(() => {
    let spaceDown = false;
    const keys: Record<string, 'left' | 'right'> = { KeyA: 'left', KeyD: 'right' };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (!showSettings) { spaceDown = controller.engine.phase === 'ready'; controller.action(); }
      } else if (keys[e.code] && !showSettings) {
        controller.press(keys[e.code]);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (spaceDown) controller.release('right');
        spaceDown = false;
      }
      else if (keys[e.code]) controller.release(keys[e.code]);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [controller, showSettings]);

  useEffect(() => {
    if (snap.result?.newBest && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fx.slowMotion = 0.8;
    }
  }, [snap.result]);

  return (
    <div className="app" onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas controller={controller} skin={snap.skin} quality={snap.settings.quality} />
      {phase === 'menu' && !showSettings && (
        <Home best={snap.save.best} onPlay={() => controller.play()} onSettings={() => setShowSettings(true)} />
      )}
      {phase !== 'menu' && <Hud hud={snap.hud} />}
      {(phase === 'ready' || phase === 'playing') && <TouchZones controller={controller} />}
      {phase === 'over' && snap.result && (
        <GameOver
          result={snap.result}
          best={snap.save.best}
          leaderboard={snap.save.leaderboard}
          onAgain={() => controller.play()}
          onHome={() => controller.home()}
        />
      )}
      {InspectorPanel && <Suspense fallback={null}><InspectorPanel controller={controller} /></Suspense>}
      {showSettings && (
        <SettingsScreen
          settings={snap.settings}
          onChange={(p) => controller.updateSettings(p)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

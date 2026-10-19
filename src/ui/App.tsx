import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { GameController } from '../game/controller';
import { GameCanvas } from '../scene/GameCanvas';
import {
  cancelOpeningIntroForGameplay,
  getOpeningIntroSnapshot,
  initOpeningIntro,
  skipOpeningIntro,
  subscribeOpeningIntro,
} from '../scene/openingIntro';
import { Hud, TouchZones } from './Hud';
import { OpeningSkip } from './OpeningSkip';
import { Home, GameOver, SettingsScreen } from './Screens';

// Development-only animation inspector; never bundled into production builds.
const INSPECT = import.meta.env.DEV && new URLSearchParams(window.location.search).has('inspect');
const InspectorPanel = INSPECT ? lazy(() => import('./InspectorPanel').then((m) => ({ default: m.InspectorPanel }))) : null;

export function App() {
  const controller = useMemo(() => new GameController(), []);
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const intro = useSyncExternalStore(subscribeOpeningIntro, getOpeningIntroSnapshot);
  const [showSettings, setShowSettings] = useState(false);
  if (import.meta.env.DEV) (window as unknown as { __kicky?: GameController }).__kicky = controller;
  const { phase } = snap.hud;
  if (import.meta.env.DEV) void import('../scene/inspector').then((m) => { (window as unknown as { __inspectorState?: unknown }).__inspectorState = m.inspector; });

  useEffect(() => { initOpeningIntro(); }, []);

  useEffect(() => {
    let spaceDown = false;
    let neckDown = false;
    const keys: Record<string, 'left' | 'right'> = { KeyA: 'left', KeyD: 'right' };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (showSettings) return;
      if (e.code === 'Space') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        cancelOpeningIntroForGameplay();
        spaceDown = controller.engine.phase === 'ready';
        controller.action();
      } else if (keys[e.code]) {
        // Foot keys only cancel the intro once a run has started (Space / Play already cancel).
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.press(keys[e.code]);
      } else if (e.code === 'KeyH') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.attemptHeader();
      } else if (e.code === 'KeyN') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        neckDown = true;
        controller.pressNeck();
      } else if (e.code === 'KeyT') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.armTrick('thigh');
      } else if (e.code === 'KeyF') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.armTrick('highFlick');
      } else if (e.code === 'KeyW') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.armTrick('aroundTheWorld');
      } else if (e.code === 'Escape') {
        controller.armTrick(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (spaceDown) controller.release('right');
        spaceDown = false;
      } else if (keys[e.code]) {
        controller.release(keys[e.code]);
      } else if (e.code === 'KeyN' && neckDown) {
        neckDown = false;
        controller.releaseNeck();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      if (neckDown) controller.releaseNeck();
    };
  }, [controller, showSettings]);

  const startGame = () => {
    cancelOpeningIntroForGameplay();
    controller.play();
  };

  return (
    <div className="app" onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas controller={controller} skin={snap.skin} quality={snap.settings.quality} />
      {intro.active && <OpeningSkip onSkip={skipOpeningIntro} />}
      {phase === 'menu' && !showSettings && !intro.active && (
        <Home best={snap.save.best} onPlay={startGame} onSettings={() => setShowSettings(true)} />
      )}
      {phase !== 'menu' && <Hud hud={snap.hud} />}
      {(phase === 'ready' || phase === 'playing') && <TouchZones controller={controller} />}
      {phase === 'over' && snap.result && (
        <GameOver
          result={snap.result}
          best={snap.save.best}
          leaderboard={snap.save.leaderboard}
          onAgain={startGame}
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

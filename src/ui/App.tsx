import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getBoot } from '../game/boots';
import { GameController } from '../game/controller';
import { sceneById } from '../game/scenes';
import type { Skin } from '../game/skins';
import { GameCanvas } from '../scene/GameCanvas';
import { Hud, TouchZones } from './Hud';
import { Home, GameOver, SettingsScreen, ShopScreen } from './Screens';
import { WorldBoard } from './WorldBoard';

function skinWithBoot(skin: Skin, bootId: string): Skin {
  const boot = getBoot(bootId);
  return { ...skin, boots: { main: boot.main, sole: boot.sole } };
}

// Development-only animation inspector; never bundled into production builds.
const INSPECT = import.meta.env.DEV && new URLSearchParams(window.location.search).has('inspect');
const InspectorPanel = INSPECT ? lazy(() => import('./InspectorPanel').then((m) => ({ default: m.InspectorPanel }))) : null;

export function App() {
  const controller = useMemo(() => new GameController(), []);
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [showSettings, setShowSettings] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const skin = useMemo(() => skinWithBoot(snap.skin, snap.save.equippedBoot), [snap.skin, snap.save.equippedBoot]);
  if (import.meta.env.DEV) (window as unknown as { __kicky?: GameController }).__kicky = controller;
  const { phase } = snap.hud;
  if (import.meta.env.DEV) void import('../scene/inspector').then((m) => { (window as unknown as { __inspectorState?: unknown }).__inspectorState = m.inspector; });

  useEffect(() => {
    let spaceDown = false;
    const keys: Record<string, 'left' | 'right'> = { KeyA: 'left', KeyD: 'right' };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (showSettings || showShop) return;
      if (e.code === 'Space') {
        e.preventDefault();
        spaceDown = controller.engine.phase === 'ready';
        controller.action();
      } else if (keys[e.code]) {
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
  }, [controller, showSettings, showShop]);

  return (
    <div className="app" onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas controller={controller} skin={skin} quality={snap.settings.quality} sceneId={snap.settings.sceneId} />
      {phase === 'menu' && !showSettings && !showShop && (
        <Home
          best={snap.save.best}
          coins={snap.save.coins}
          scene={sceneById(snap.settings.sceneId)}
          onPlay={() => controller.play()}
          onSettings={() => { setShowShop(false); setShowSettings(true); }}
          onShop={() => { setShowSettings(false); setShowShop(true); }}
        />
      )}
      {phase !== 'menu' && <Hud hud={snap.hud} />}
      {(phase === 'ready' || phase === 'playing') && !showShop && (
        <WorldBoard live nickname={snap.settings.nickname} score={snap.hud.score} best={snap.save.best} />
      )}
      {(phase === 'ready' || phase === 'playing') && <TouchZones controller={controller} />}
      {phase === 'over' && snap.result && !showShop && (
        <GameOver
          result={snap.result}
          best={snap.save.best}
          coins={snap.save.coins}
          nickname={snap.settings.nickname}
          leaderboard={snap.save.leaderboard}
          onAgain={() => controller.play()}
          onHome={() => controller.home()}
          onShop={() => setShowShop(true)}
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
      {showShop && (
        <ShopScreen save={snap.save} onBuy={(id) => controller.buyBoot(id)} onClose={() => setShowShop(false)} />
      )}
    </div>
  );
}

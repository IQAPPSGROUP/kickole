import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { installAudioLifecycle } from '../game/audio';
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
import { CustomiseScreen, ShopScreen } from './Wardrobe';

const INSPECT = import.meta.env.DEV && new URLSearchParams(window.location.search).has('inspect');
const InspectorPanel = INSPECT ? lazy(() => import('./InspectorPanel').then((m) => ({ default: m.InspectorPanel }))) : null;

type Overlay = 'none' | 'settings' | 'customise' | 'shop';

export function App() {
  const controller = useMemo(() => new GameController(), []);
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const intro = useSyncExternalStore(subscribeOpeningIntro, getOpeningIntroSnapshot);
  const [overlay, setOverlay] = useState<Overlay>('none');
  if (import.meta.env.DEV) (window as unknown as { __kicky?: GameController }).__kicky = controller;
  const { phase } = snap.hud;
  if (import.meta.env.DEV) void import('../scene/inspector').then((m) => { (window as unknown as { __inspectorState?: unknown }).__inspectorState = m.inspector; });

  useEffect(() => { initOpeningIntro(); }, []);

  useEffect(() => {
    installAudioLifecycle();
    const prime = () => controller.primeAudio();
    window.addEventListener('pointerdown', prime, { capture: true });
    window.addEventListener('keydown', prime, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', prime, { capture: true });
      window.removeEventListener('keydown', prime, { capture: true });
    };
  }, [controller]);

  const blocking = overlay !== 'none';

  useEffect(() => {
    let spaceDown = false;
    let neckDown = false;
    const keys: Record<string, 'left' | 'right'> = { KeyA: 'left', KeyD: 'right' };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (blocking) return;
      if (e.code === 'Space') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        cancelOpeningIntroForGameplay();
        spaceDown = controller.engine.phase === 'ready';
        controller.action();
      } else if (keys[e.code]) {
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
  }, [controller, blocking]);

  const startGame = () => {
    cancelOpeningIntroForGameplay();
    setOverlay('none');
    controller.play();
  };

  const closeOverlay = () => {
    controller.clearPreview();
    setOverlay('none');
  };

  return (
    <div className="app" onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas controller={controller} skin={snap.skin} quality={snap.settings.quality} />
      {intro.active && <OpeningSkip onSkip={skipOpeningIntro} />}
      {phase === 'menu' && overlay === 'none' && !intro.active && (
        <Home
          best={snap.save.best}
          coins={snap.save.coins}
          onPlay={startGame}
          onSettings={() => setOverlay('settings')}
          onCustomise={() => setOverlay('customise')}
          onShop={() => setOverlay('shop')}
        />
      )}
      {phase !== 'menu' && <Hud hud={snap.hud} />}
      {(phase === 'ready' || phase === 'playing') && <TouchZones controller={controller} />}
      {phase === 'over' && snap.result && overlay === 'none' && (
        <GameOver
          result={snap.result}
          best={snap.save.best}
          coins={snap.save.coins}
          leaderboard={snap.save.leaderboard}
          onAgain={startGame}
          onHome={() => controller.home()}
          onShop={() => setOverlay('shop')}
        />
      )}
      {InspectorPanel && <Suspense fallback={null}><InspectorPanel controller={controller} /></Suspense>}
      {overlay === 'settings' && (
        <SettingsScreen
          settings={snap.settings}
          onChange={(p) => controller.updateSettings(p)}
          onClose={closeOverlay}
        />
      )}
      {overlay === 'customise' && (
        <CustomiseScreen
          save={snap.save}
          onChange={(a) => controller.setAppearance(a)}
          onClose={closeOverlay}
        />
      )}
      {overlay === 'shop' && (
        <ShopScreen
          save={snap.save}
          onBuyBoot={(id) => controller.buyBoot(id)}
          onBuyKit={(id) => controller.buyKit(id)}
          onPreview={(opts) => controller.previewEquipment(opts)}
          onClose={closeOverlay}
        />
      )}
    </div>
  );
}

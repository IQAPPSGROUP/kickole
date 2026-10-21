import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { installAudioLifecycle } from '../game/audio';
import { GameController, type Result } from '../game/controller';
import { createMockLeaderboard, type LeaderboardService } from '../game/leaderboard';
import { mockBoardFromSearch } from '../game/mockBoard';
import { hydrateBoardOptIn, hydrateCountry, hydrateDeviceId, hydrateNickname, loadBoardOptIn, loadDeviceId, loadNickname, loadStoredCountry, resetLeaderboardIdentity, saveBoardOptIn, saveCountry, saveNickname, type BoardOptIn } from '../game/nicknameStore';
import { deletePlayerAccount, peekNickname, registerPlayer, serverNicknameMessage, suggestFreeNames, createSupabaseLeaderboard } from '../game/supabaseLeaderboard';
import { GameCanvas } from '../scene/GameCanvas';
import {
  cancelOpeningIntroForGameplay,
  getOpeningIntroSnapshot,
  initOpeningIntro,
  skipOpeningIntro,
  subscribeOpeningIntro,
} from '../scene/openingIntro';
import { fanLayout } from './fanLayout';
import { footSideAt, footTapAction } from './restartTap';
import { Hud, TouchZones } from './Hud';
import { OpeningSkip } from './OpeningSkip';
import { NicknameScreen, OptInCard } from './NicknameScreen';
import { DataScreen, Home, GameOver, LeaderboardDataScreen, PauseScreen, SettingsScreen } from './Screens';
import { BodySelect, CustomiseScreen, ShopScreen } from './Wardrobe';

const INSPECT = import.meta.env.DEV && new URLSearchParams(window.location.search).has('inspect');
const InspectorPanel = INSPECT ? lazy(() => import('./InspectorPanel').then((m) => ({ default: m.InspectorPanel }))) : null;

type Overlay = 'none' | 'settings' | 'customise' | 'shop' | 'data' | 'how';

const REVIEW_NICKNAME = 'Turbo Striker';
const REVIEW_COUNTRY = 'GB';
const REVIEW_RESULT: Result = {
  score: 420,
  kickUps: 24,
  bestStreak: 8,
  combos: 3,
  durationMs: 24000,
  kickTimesMs: [800, 1600, 2400],
  newBest: false,
  rank: 40,
  coinsEarned: 4,
};

export function App() {
  const controller = useMemo(() => new GameController(), []);
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const intro = useSyncExternalStore(subscribeOpeningIntro, getOpeningIntroSnapshot);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [paused, setPaused] = useState(false);
  const [nickname, setNickname] = useState<string | null>(() => loadNickname());
  const [countryChoice, setCountryChoice] = useState(() => loadStoredCountry());
  const [optIn, setOptIn] = useState<BoardOptIn>(() => loadBoardOptIn());
  const mockBoard = useMemo(() => mockBoardFromSearch(window.location.search), []);
  const [deviceReady, setDeviceReady] = useState(mockBoard);
  const [blockedTick, setBlockedTick] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(mockBoard);
  const reviewing = mockBoard && optIn !== 'out';
  const boardName = nickname ?? (reviewing ? REVIEW_NICKNAME : null);
  const boardCountry = countryChoice.chosen ? countryChoice.country : (reviewing ? REVIEW_COUNTRY : null);
  const leaderboardOn = optIn === 'in' || (reviewing && optIn === 'unknown');
  const board = useMemo((): LeaderboardService | null => {
    if (!leaderboardOn || !boardName || !deviceReady) return null;
    const options = { nickname: boardName, country: boardCountry };
    return mockBoard ? createMockLeaderboard(options) : createSupabaseLeaderboard(options);
  }, [leaderboardOn, boardName, boardCountry, deviceReady, mockBoard]);
  if (import.meta.env.DEV) (window as unknown as { __kicky?: GameController }).__kicky = controller;
  const { phase } = snap.hud;
  if (import.meta.env.DEV) void import('../scene/inspector').then((m) => { (window as unknown as { __inspectorState?: unknown }).__inspectorState = m.inspector; });

  useEffect(() => {
    if (mockBoard) {
      skipOpeningIntro();
      if (!controller.getSnapshot().save.bodyChosen) controller.chooseBody('male');
      return;
    }
    initOpeningIntro();
  }, [controller, mockBoard]);

  useEffect(() => {
    let live = true;
    void (async () => {
      await hydrateDeviceId();
      const name = await hydrateNickname();
      const stored = await hydrateCountry();
      const choice = await hydrateBoardOptIn();
      if (!live) return;
      if (name) setNickname((current) => current ?? name);
      setCountryChoice(stored);
      setOptIn(choice);
      setDeviceReady(true);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!board) return undefined;
    board.start();
    return () => board.stop();
  }, [board]);

  useEffect(() => {
    if (phase !== 'over' || !snap.result || !board) return;
    if (snap.result.score <= 0 || snap.result.durationMs <= 0) return;
    board.submit(snap.result.score, Date.now(), {
      combo: snap.result.combos,
      durationMs: snap.result.durationMs,
      kickTimesMs: snap.result.kickTimesMs,
    });
  }, [phase, snap.result, board]);

  useEffect(() => {
    if (!paused) return;
    if (phase === 'ready' || phase === 'playing') return;
    setPaused(false);
    controller.holdPlay(false);
  }, [paused, phase, controller]);

  useEffect(() => {
    const readInset = (name: string) => {
      const app = document.querySelector('.app');
      if (!app) return 0;
      const value = parseFloat(getComputedStyle(app).getPropertyValue(name));
      return Number.isFinite(value) ? value : 0;
    };
    const onDown = (event: PointerEvent) => {
      if (paused) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const layout = fanLayout(window.innerWidth, readInset('--sat-l'), readInset('--sat-r'), readInset('--sat-b'));
      const side = footSideAt(event.clientX, event.clientY, window.innerWidth, window.innerHeight, layout);
      if (!side) return;
      if (footTapAction(controller.engine.phase) === 'kick') controller.press(side, event.pointerId);
    };
    const onUp = (event: PointerEvent) => {
      controller.releasePointer(event.pointerId);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [controller, paused]);

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

  const needsBody = !snap.save.bodyChosen && !mockBoard;
  const needsOpt = optIn === 'unknown' && !mockBoard;
  const needsNick = leaderboardOn && nickname == null && !mockBoard;
  const blocking = overlay !== 'none' || needsBody || needsOpt || needsNick;

  useEffect(() => {
    let spaceDown = false;
    let neckDown = false;
    const keys: Record<string, 'left' | 'right'> = { KeyA: 'left', KeyD: 'right' };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (paused) {
        if (e.code === 'Escape') {
          e.preventDefault();
          setPaused(false);
          controller.holdPlay(false);
        }
        return;
      }
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
        controller.playTrick('thigh');
      } else if (e.code === 'KeyF') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.playTrick('highFlick');
      } else if (e.code === 'KeyW') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.playTrick('aroundTheWorld');
      } else if (e.code === 'KeyG') {
        if (controller.engine.phase !== 'menu') cancelOpeningIntroForGameplay();
        controller.playTrick('groove');
      } else if (e.code === 'Escape') {
        if (controller.engine.celebration) controller.skipCelebration();
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
  }, [controller, blocking, paused]);

  const startGame = () => {
    cancelOpeningIntroForGameplay();
    setOverlay('none');
    board?.startRun();
    controller.play();
  };

  const closeOverlay = () => {
    controller.clearPreview();
    setOverlay('none');
  };

  const lockNickname = async (adjective: string, noun: string, country: string | null): Promise<string | void> => {
    const deviceId = await hydrateDeviceId();
    let finalName = `${adjective} ${noun}`;
    if (!mockBoard) {
      const result = await registerPlayer({
        deviceId: deviceId || loadDeviceId(),
        adjective,
        noun,
        country,
      });
      if (!result.ok) return serverNicknameMessage(result.reason);
      if (result.nickname) finalName = result.nickname;
    }
    saveNickname(finalName);
    saveCountry(country);
    setNickname(finalName);
    setCountryChoice({ chosen: true, country });
    setDeviceReady(true);
  };

  const peekTag = async (adjective: string, noun: string) => {
    const deviceId = await hydrateDeviceId();
    return peekNickname({ deviceId: deviceId || loadDeviceId(), adjective, noun });
  };

  const suggestTags = async (request: { count: number; adjective: string | null; noun: string | null }) => {
    const deviceId = await hydrateDeviceId();
    return suggestFreeNames({
      deviceId: deviceId || loadDeviceId(),
      count: request.count,
      adjective: request.adjective,
      noun: request.noun,
    });
  };

  const joinBoard = () => {
    saveBoardOptIn('in');
    setOptIn('in');
  };

  const leaveBoardPrompt = () => {
    saveBoardOptIn('out');
    setOptIn('out');
  };

  const setLeaderboard = (on: boolean) => {
    if (on) joinBoard();
    else leaveBoardPrompt();
    if (on && !nickname) setOverlay('none');
  };

  const deleteBoardData = async (): Promise<string | void> => {
    if (!mockBoard) {
      const deviceId = await hydrateDeviceId();
      const removed = await deletePlayerAccount({ deviceId: deviceId || loadDeviceId() });
      if (!removed.ok) return 'Could not reach the board. Try again when you are online.';
    }
    await resetLeaderboardIdentity();
    setNickname(null);
    setCountryChoice({ chosen: false, country: null });
    setBlockedTick((value) => value + 1);
    setDeviceReady(true);
  };

  return (
    <div className="app" onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas controller={controller} skin={snap.skin} graphics={snap.settings.graphics} />
      {intro.active && !mockBoard && !needsBody && !needsOpt && !needsNick && <OpeningSkip onSkip={skipOpeningIntro} />}
      {needsBody && phase === 'menu' && (
        <BodySelect onChoose={(body) => controller.chooseBody(body)} />
      )}
      {!needsBody && needsOpt && phase === 'menu' && overlay === 'none' && (
        <OptInCard onJoin={joinBoard} onNotNow={leaveBoardPrompt} onData={() => setOverlay('how')} />
      )}
      {!needsBody && !needsOpt && needsNick && phase === 'menu' && overlay === 'none' && (
        <NicknameScreen onSave={lockNickname} onPeek={mockBoard ? undefined : peekTag} onSuggest={mockBoard ? undefined : suggestTags} />
      )}
      {phase === 'menu' && overlay === 'none' && !intro.active && !needsBody && !needsOpt && !needsNick && !(reviewOpen && board) && (
        <Home
          best={snap.save.best}
          coins={snap.save.coins}
          onPlay={startGame}
          onSettings={() => setOverlay('settings')}
          onCustomise={() => setOverlay('customise')}
          onShop={() => setOverlay('shop')}
        />
      )}
      {phase !== 'menu' && (
        <Hud
          hud={snap.hud}
          controller={controller}
          nickname={nickname ?? (reviewing ? boardName : null)}
          board={board}
          onSkipCelebration={() => controller.skipCelebration()}
        />
      )}
      {(phase === 'ready' || phase === 'playing') && (
        <TouchZones
          controller={controller}
          onPause={() => {
            setPaused(true);
            controller.holdPlay(true);
          }}
        />
      )}
      {paused && (phase === 'ready' || phase === 'playing') && (
        <PauseScreen
          song={snap.settings.song}
          enabledSongs={snap.settings.enabledSongs}
          onSong={(song) => controller.updateSettings({ song })}
          onClose={() => {
            setPaused(false);
            controller.holdPlay(false);
          }}
        />
      )}
      {reviewOpen && phase === 'menu' && overlay === 'none' && board && (
        <GameOver
          result={REVIEW_RESULT}
          best={Math.max(snap.save.best, REVIEW_RESULT.score)}
          coins={snap.save.coins}
          board={board}
          onAgain={startGame}
          onHome={() => setReviewOpen(false)}
          onShop={() => setOverlay('shop')}
          rowLimit={25}
          initialView="top"
        />
      )}
      {phase === 'over' && snap.result && overlay === 'none' && (
        <GameOver
          result={snap.result}
          best={snap.save.best}
          coins={snap.save.coins}
          board={board}
          onAgain={startGame}
          onHome={() => controller.home()}
          onShop={() => setOverlay('shop')}
          rowLimit={mockBoard ? 25 : 10}
        />
      )}
      {InspectorPanel && <Suspense fallback={null}><InspectorPanel controller={controller} /></Suspense>}
      {overlay === 'settings' && (
        <SettingsScreen
          settings={snap.settings}
          nickname={nickname ?? (reviewing ? boardName ?? '' : '')}
          country={countryChoice.country}
          leaderboardOn={leaderboardOn}
          blockedTick={blockedTick}
          onNickname={lockNickname}
          onLeaderboard={setLeaderboard}
          onUnblock={() => setBlockedTick((value) => value + 1)}
          onDelete={deleteBoardData}
          onData={() => setOverlay('data')}
          onPeek={mockBoard ? undefined : peekTag}
          onSuggest={mockBoard ? undefined : suggestTags}
          board={board}
          onChange={(p) => controller.updateSettings(p)}
          onToggleSong={(id) => controller.toggleSong(id)}
          onClose={closeOverlay}
        />
      )}
      {overlay === 'how' && (
        <DataScreen onClose={() => setOverlay('none')} />
      )}
      {overlay === 'data' && (
        <LeaderboardDataScreen onClose={() => setOverlay('settings')} />
      )}
      {overlay === 'customise' && (
        <CustomiseScreen
          save={snap.save}
          onChange={(a) => controller.setAppearance(a)}
          onBody={(body) => controller.chooseBody(body)}
          onClose={closeOverlay}
        />
      )}
      {overlay === 'shop' && (
        <ShopScreen
          save={snap.save}
          launchProduct={snap.launchProduct}
          billingPlatform={snap.billingPlatform}
          billingMessage={snap.billingMessage}
          billingBusy={snap.billingBusy}
          onBuyBoot={(id) => controller.buyBoot(id)}
          onBuyKit={(id) => controller.buyKit(id)}
          onEquipDance={(id) => controller.equipDance(id)}
          onPurchaseLaunch={() => { void controller.purchaseLaunchCollection(); }}
          onRestorePurchases={() => { void controller.restorePurchases(); }}
          onPreview={(opts) => controller.previewEquipment(opts)}
          onClose={closeOverlay}
        />
      )}
    </div>
  );
}

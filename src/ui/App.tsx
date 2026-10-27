import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { installAudioLifecycle } from '../game/audio';
import { GameController, type Result } from '../game/controller';
import { countryByCode } from '../game/countries';
import { createMockLeaderboard, type LeaderboardService } from '../game/leaderboard';
import { parseNickname } from '../game/nickname';
import { mockBoardFromSearch, mockCrowdFromSearch, shownBoardScore } from '../game/mockBoard';
import { hydrateBoardOptIn, hydrateCountry, hydrateDeviceId, hydrateNickname, loadBoardOptIn, loadDeviceId, loadNickname, loadStoredCountry, resetLeaderboardIdentity, saveBoardOptIn, saveCountry, saveNickname, type BoardOptIn } from '../game/nicknameStore';
import { deletePlayerAccount, peekNickname, registerPlayer, serverNicknameMessage, suggestFreeNames, createSupabaseLeaderboard } from '../game/supabaseLeaderboard';
import { GameCanvas } from '../scene/GameCanvas';
import { fanLayout } from './fanLayout';
import { footSideAt, footTapAction } from './restartTap';
import { Hud, SongChip, TouchZones } from './Hud';
import { CountryScreen, NicknameScreen, OptInCard } from './NicknameScreen';
import { DataScreen, Home, GameOver, LeaderboardDataScreen, LeaderboardSheet, PauseScreen, SettingsScreen } from './Screens';
import { pointerOpensTheCourt } from './boardGesture';
import { KitColoursScreen } from './KitColours';
import { BodySelect, CustomiseScreen } from './Wardrobe';

const INSPECT = import.meta.env.DEV && new URLSearchParams(window.location.search).has('inspect');
const InspectorPanel = INSPECT ? lazy(() => import('./InspectorPanel').then((m) => ({ default: m.InspectorPanel }))) : null;

type Overlay = 'none' | 'settings' | 'customise' | 'kit' | 'data' | 'how';

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
};

export function App() {
  const controller = useMemo(() => new GameController(), []);
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [kitReturn, setKitReturn] = useState<Overlay>('none');
  const [paused, setPaused] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [nickname, setNickname] = useState<string | null>(() => loadNickname());
  const [countryChoice, setCountryChoice] = useState(() => loadStoredCountry());
  const [optIn, setOptIn] = useState<BoardOptIn>(() => loadBoardOptIn());
  const mockBoard = useMemo(() => mockBoardFromSearch(window.location.search), []);
  const mockCrowd = useMemo(() => mockCrowdFromSearch(window.location.search), []);
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
    return mockBoard ? createMockLeaderboard({ ...options, crowdSize: mockCrowd }) : createSupabaseLeaderboard(options);
  }, [leaderboardOn, boardName, boardCountry, deviceReady, mockBoard, mockCrowd]);
  if (import.meta.env.DEV) (window as unknown as { __kicky?: GameController }).__kicky = controller;
  const { phase } = snap.hud;
  if (import.meta.env.DEV) void import('../scene/inspector').then((m) => { (window as unknown as { __inspectorState?: unknown }).__inspectorState = m.inspector; });

  useEffect(() => {
    if (mockBoard && !controller.getSnapshot().save.bodyChosen) controller.chooseBody('male');
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
      if (!pointerOpensTheCourt(event.target)) return;
      if (paused || boardOpen) return;
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
  }, [controller, paused, boardOpen]);

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
  const needsCountry = leaderboardOn && nickname != null && !countryChoice.chosen && !mockBoard;
  const blocking = overlay !== 'none' || needsBody || needsOpt || needsNick || needsCountry;

  useEffect(() => {
    let spaceDown = false;
    let neckDown = false;
    const keys: Record<string, 'left' | 'right'> = { KeyA: 'left', KeyD: 'right' };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (boardOpen && e.code === 'Escape') {
        e.preventDefault();
        setBoardOpen(false);
        return;
      }
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
        spaceDown = controller.engine.phase === 'ready';
        controller.action();
      } else if (keys[e.code]) {
        if (controller.engine.phase !== 'menu') controller.press(keys[e.code]);
      } else if (e.code === 'KeyH') {
        if (controller.engine.phase !== 'menu') controller.attemptHeader();
      } else if (e.code === 'KeyN') {
        if (controller.engine.phase !== 'menu') neckDown = true;
        controller.pressNeck();
      } else if (e.code === 'KeyT') {
        if (controller.engine.phase !== 'menu') controller.playTrick('thigh');
      } else if (e.code === 'KeyF') {
        if (controller.engine.phase !== 'menu') controller.playTrick('highFlick');
      } else if (e.code === 'KeyW') {
        if (controller.engine.phase !== 'menu') controller.playTrick('aroundTheWorld');
      } else if (e.code === 'KeyG') {
        if (controller.engine.phase !== 'menu') controller.playTrick('groove');
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
  }, [controller, blocking, paused, boardOpen]);

  const openBoard = () => {
    if (controller.engine.phase === 'ready' || controller.engine.phase === 'playing') {
      setPaused(true);
      controller.holdPlay(true);
    }
    setBoardOpen(true);
  };

  const boardScore = shownBoardScore({
    phase,
    best: snap.save.best,
    hudScore: snap.hud.score,
    resultScore: phase === 'over' && snap.result ? snap.result.score : null,
    reviewScore: reviewOpen ? REVIEW_RESULT.score : null,
  });

  const startGame = () => {
    setOverlay('none');
    board?.startRun();
    controller.play();
  };

  const closeOverlay = () => {
    setOverlay('none');
  };

  const openKitColours = (from: Overlay) => {
    setKitReturn(from);
    setOverlay('kit');
  };

  const closeKitColours = () => {
    setOverlay(kitReturn);
  };

  const lockNickname = async (adjective: string, noun: string): Promise<string | void> => {
    const country = countryChoice.chosen ? countryChoice.country : null;
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
    if (countryChoice.chosen) saveCountry(country);
    setNickname(finalName);
    setDeviceReady(true);
  };

  const saveCountryChoice = async (country: string | null): Promise<string | void> => {
    const parsed = parseNickname(nickname ?? '');
    if (!mockBoard) {
      if (!parsed) return 'Pick a nickname before choosing a country.';
      const deviceId = await hydrateDeviceId();
      const result = await registerPlayer({
        deviceId: deviceId || loadDeviceId(),
        adjective: parsed.adjective,
        noun: parsed.noun,
        country,
      });
      if (!result.ok) return serverNicknameMessage(result.reason);
    }
    if (!saveCountry(country)) return 'Pick a country from the list.';
    setCountryChoice({ chosen: true, country: countryByCode(country)?.code ?? null });
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

  const showSongChip = (phase === 'menu' || phase === 'ready' || phase === 'playing')
    && overlay === 'none'
    && !paused
    && !boardOpen
    && !needsBody
    && !needsOpt
    && !needsNick
    && !needsCountry
    && !(reviewOpen && board);

  return (
    <div className="app" onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas controller={controller} skin={snap.skin} graphics={snap.settings.graphics} />
      {needsBody && phase === 'menu' && (
        <BodySelect onChoose={(body) => controller.chooseBody(body)} />
      )}
      {!needsBody && needsOpt && phase === 'menu' && overlay === 'none' && (
        <OptInCard onJoin={joinBoard} onNotNow={leaveBoardPrompt} onData={() => setOverlay('how')} />
      )}
      {!needsBody && !needsOpt && needsNick && phase === 'menu' && overlay === 'none' && (
        <NicknameScreen onSave={lockNickname} onPeek={mockBoard ? undefined : peekTag} onSuggest={mockBoard ? undefined : suggestTags} />
      )}
      {!needsBody && !needsOpt && !needsNick && needsCountry && phase === 'menu' && overlay === 'none' && (
        <CountryScreen onSave={saveCountryChoice} />
      )}
      {phase === 'menu' && overlay === 'none' && !needsBody && !needsOpt && !needsNick && !needsCountry && !(reviewOpen && board) && (
        <Home
          best={snap.save.best}
          onPlay={startGame}
          onSettings={() => setOverlay('settings')}
          onCustomise={() => setOverlay('customise')}
          onKitColours={() => openKitColours('none')}
          onLeaderboard={openBoard}
        />
      )}
      {phase !== 'menu' && (
        <Hud
          hud={snap.hud}
          controller={controller}
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
      {showSongChip && <SongChip controller={controller} />}
      {paused && !boardOpen && (phase === 'ready' || phase === 'playing') && (
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
          onAgain={startGame}
          onHome={() => setReviewOpen(false)}
          onLeaderboard={openBoard}
        />
      )}
      {phase === 'over' && snap.result && overlay === 'none' && (
        <GameOver
          result={snap.result}
          best={snap.save.best}
          onAgain={startGame}
          onHome={() => controller.home()}
          onLeaderboard={openBoard}
        />
      )}
      {boardOpen && (
        <LeaderboardSheet
          board={board}
          score={boardScore}
          onClose={() => setBoardOpen(false)}
          onJoin={leaderboardOn ? undefined : () => {
            setBoardOpen(false);
            joinBoard();
          }}
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
          onCountry={saveCountryChoice}
          onLeaderboard={setLeaderboard}
          onUnblock={() => setBlockedTick((value) => value + 1)}
          onDelete={deleteBoardData}
          onData={() => setOverlay('data')}
          onKitColours={() => openKitColours('settings')}
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
      {overlay === 'kit' && (
        <KitColoursScreen
          save={snap.save}
          onPick={(id) => controller.setKitColour(id)}
          onClose={closeKitColours}
        />
      )}
      {overlay === 'customise' && (
        <CustomiseScreen
          save={snap.save}
          onChange={(a) => controller.setAppearance(a)}
          onBody={(body) => controller.chooseBody(body)}
          onKitColours={() => openKitColours('customise')}
          onClose={closeOverlay}
        />
      )}
    </div>
  );
}

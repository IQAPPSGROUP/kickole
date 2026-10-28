import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Result } from '../game/controller';
import { countryByCode } from '../game/countries';
import { COUNTRY_BOARD_MIN, readBlockedNames, writeBlockedNames, type BoardEntry, type BoardPeriod, type BoardScope, type LeaderboardService } from '../game/leaderboard';
import type { FreePair } from '../game/nickname';
import { CHILD_SAFETY_URL, PRIVACY_URL, TERMS_URL } from '../site';
import {
  BLOCK_CONFIRMATION,
  DONE_CONFIRMATION,
  REPORT_PRIVACY_LINE,
  REPORT_REASONS,
  REPORT_THANKS,
  type ReportReason,
} from '../game/reportReasons';
import type { PeekOutcome } from '../game/supabaseLeaderboard';
import type { GraphicsChoice, Settings } from '../game/storage';
import { GAME_TRACKS, SHUFFLE_SONG, type GameTrackId, type SongChoice } from '../game/tracks';
import { NameFlag } from './NameFlag';
import { CountryChoice, NicknameForm } from './NicknameScreen';
import { PrivacyNotice } from './PrivacyNotice';
import {
  detectTier,
  getDeviceSnapshot,
  getRunningTier,
  resolveTier,
  subscribeDevice,
  subscribeRunningTier,
} from '../scene/qualityTier';

const brand = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export function Logo() {
  return (
    <h1 className="logo">
      <img
        className="logo-mark"
        src={brand('icons/icon-192.png')}
        alt=""
        width={192}
        height={192}
        draggable={false}
      />
      <img
        className="logo-word"
        src={brand('brand/kickole-wordmark.webp')}
        alt="KICKOLÉ"
        width={1024}
        height={368}
        draggable={false}
      />
    </h1>
  );
}

export function Home({
  best, onPlay, onSettings, onCustomise, onKitColours, onLeaderboard,
}: {
  best: number;
  onPlay: () => void;
  onSettings: () => void;
  onCustomise: () => void;
  onKitColours: () => void;
  onLeaderboard: () => void;
}) {
  return (
    <div className="screen home">
      <div className="home-top">
        <p className="court-label">FUTEBOL DE RUA <span>•</span> STREET FREESTYLE</p>
        <Logo />
        <p className="tagline">Find your rhythm. Own the court.</p>
      </div>
      <div className="home-bottom">
        <div className="pill-row">
          <div className="best-pill">BEST <b>{best}</b></div>
        </div>
        <button className="btn primary big" onClick={onPlay}>LET’S PLAY <span aria-hidden="true">↗</span></button>
        <div className="home-actions">
          <button className="btn ghost" onClick={onCustomise}>CUSTOMISE</button>
        </div>
        <button className="btn ghost" onClick={onKitColours}>CHOOSE YOUR KIT</button>
        <button className="btn ghost" onClick={onLeaderboard}>LEADERBOARD</button>
        <button className="btn ghost" onClick={onSettings}>SETTINGS</button>
        <p className="home-help">Tap to juggle · Hold L or R to kick higher · Hold through the ball to stall</p>
        <p className="credit">IQ Apps Group · v1.0</p>
      </div>
    </div>
  );
}

export function GameOver({
  result, best, onAgain, onHome, onLeaderboard,
}: {
  result: Result;
  best: number;
  onAgain: () => void;
  onHome: () => void;
  onLeaderboard: () => void;
}) {
  return (
    <div className="screen over">
      <div className="card over-card">
        <h2>{result.newBest ? 'NEW BEST!' : 'GAME OVER'}</h2>
        <div className="final">{result.score}</div>
        <div className="stats">
          <div><b>{result.kickUps}</b><span>KICK-UPS</span></div>
          <div><b>{best}</b><span>BEST</span></div>
          <div><b>{result.bestStreak}</b><span>BEST COMBO</span></div>
        </div>
        <button type="button" className="btn ghost" onClick={onLeaderboard}>LEADERBOARD</button>
        <button className="btn primary big" onClick={onAgain} autoFocus>PLAY AGAIN</button>
        <button className="btn ghost" onClick={onHome}>HOME</button>
      </div>
    </div>
  );
}

type SheetStep = 'actions' | 'reasons';

function rowSheetStep(step: SheetStep, actions: {
  onReasons: () => void;
  onReport: (reason: ReportReason) => void;
  onBlock: () => void;
  onBack: () => void;
  onClose: () => void;
}): ReactNode {
  switch (step) {
    case 'actions':
      return (
        <>
          <button type="button" className="sheet-report" onClick={actions.onReasons}>Report</button>
          <button type="button" className="sheet-block" onClick={actions.onBlock}>Block</button>
          <button type="button" onClick={actions.onClose}>Close</button>
        </>
      );
    case 'reasons':
      return (
        <>
          <p className="sheet-privacy">{REPORT_PRIVACY_LINE}</p>
          {REPORT_REASONS.map((item) => (
            <button key={item.code} type="button" className="sheet-reason" onClick={() => actions.onReport(item.code)}>
              {item.label}
            </button>
          ))}
          <button type="button" onClick={actions.onBack}>Back</button>
        </>
      );
    default: {
      const neverStep: never = step;
      return neverStep;
    }
  }
}

function ScreenModal({
  label,
  onBackdrop,
  children,
}: {
  label: string;
  onBackdrop?: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <div className="screen-modal" onClick={onBackdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function idleSubscribe(): () => void {
  return () => {};
}

const PERIODS: readonly { id: BoardPeriod; label: string; title?: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Week', title: 'Monday to Sunday UTC' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

function hiddenBoardNote(scope: BoardScope): string {
  switch (scope) {
    case 'country':
      return `Not enough players in your country yet. A country board appears once ${COUNTRY_BOARD_MIN} players have joined.`;
    case 'world':
      return `Leaderboard appears once ${COUNTRY_BOARD_MIN} players have scored`;
    default: {
      const neverScope: never = scope;
      return neverScope;
    }
  }
}

function rankLabel(rank: number): string {
  return rank > 0 ? rank.toLocaleString('en-US') : '—';
}

/** Four-digit places ("1,600") use a tighter face so they stay inside the rank column. */
function rankClass(rank: number): string {
  return rankLabel(rank).length > 4 ? 'board-rank is-wide' : 'board-rank';
}

function entryLabel(row: BoardEntry): string {
  const country = row.country ? countryByCode(row.country)?.name : null;
  return [String(row.rank), country, row.nickname, String(row.score)].filter((part) => part != null && part !== '').join(' ');
}

const BOARD_ROW_LIMIT = 50;

/** Full-screen board. The list scrolls on its own so the court cannot eat the touch. */
export function LeaderboardSheet({
  board, score, onClose, onJoin,
}: {
  board: LeaderboardService | null;
  score: number;
  onClose: () => void;
  onJoin?: () => void;
}) {
  const [period, setPeriod] = useState<BoardPeriod>('all');
  const [scope, setScope] = useState<BoardScope>('world');
  const [sheet, setSheet] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<SheetStep>('actions');
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  void useSyncExternalStore(board ? board.subscribe : idleSubscribe, () => board?.revision ?? 0);
  void revision;
  const page = board ? board.board(period, scope, score, BOARD_ROW_LIMIT) : { hidden: false, rows: [] as BoardEntry[] };
  const optedOut = scope === 'country' && !board?.country;
  const mine = board ? board.around(score, scope, period).me : null;
  const rows = board && !optedOut && !page.hidden ? page.rows : [];
  const closeActions = () => {
    setSheet(null);
    setSheetStep('actions');
  };
  const reportName = (reason: ReportReason) => {
    if (!sheet || !board) return;
    board.report(sheet, reason);
    setNotice(REPORT_THANKS);
    closeActions();
    setRevision((value) => value + 1);
  };
  const blockName = () => {
    if (!sheet || !board) return;
    board.block(sheet);
    setNotice(BLOCK_CONFIRMATION);
    closeActions();
    setRevision((value) => value + 1);
  };
  const rankText = mine && mine.rank > 0 ? mine.rank.toLocaleString('en-US') : '—';
  const youCountry = countryByCode(mine?.country ?? board?.country)?.name ?? null;
  return createPortal(
    <div className="leaderboard-sheet" data-board-sheet role="dialog" aria-modal="true" aria-label="Leaderboard">
      <div className="leaderboard-head">
        <h2>LEADERBOARD</h2>
        <div className="leaderboard-periods" role="tablist" aria-label="Board period">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={period === item.id}
              className={period === item.id ? 'on' : ''}
              title={item.title}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="seg board-tabs" role="tablist" aria-label="World or country">
          {(['world', 'country'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              className={scope === id ? 'on' : ''}
              onClick={() => setScope(id)}
            >
              {id === 'world' ? 'World' : 'Country'}
            </button>
          ))}
        </div>
      </div>
      {!board && (
        <div className="leaderboard-scroll" data-board-scroll>
          <p className="panel-note">The leaderboard is off until you join. A nickname from our word lists and your score are sent for the board. Country is optional. If you choose one, its flag is shown beside your nickname.</p>
          {onJoin && <button type="button" className="btn primary" onClick={onJoin}>TURN IT ON</button>}
        </div>
      )}
      {board && (
        <div className="leaderboard-scroll" data-board-scroll>
          {!page.hidden && (
            <div className="leaderboard-you" aria-label={`Your rank ${rankText}${youCountry ? ` ${youCountry}` : ''} ${board.nickname} ${mine?.score ?? score}`}>
              <span>YOUR RANK</span>
              <b>{rankText}</b>
              <em><NameFlag country={mine?.country ?? board.country} />{board.nickname}</em>
              <strong>{mine?.score ?? score}</strong>
            </div>
          )}
          {optedOut && <p className="panel-note">You chose not to appear on a country board.</p>}
          {!optedOut && page.hidden && <p className="panel-note">{hiddenBoardNote(scope)}</p>}
          {!optedOut && !page.hidden && (
            <ol className="board">
              {rows.map((row) => (
                <li key={`${period}:${scope}:${row.rank}:${row.nickname}`} className={`${row.mine ? 'me' : ''}${row.rank === 1 ? ' is-first' : ''}`} aria-label={entryLabel(row)}>
                  <span className={rankClass(row.rank)}>{rankLabel(row.rank)}</span>
                  <b><NameFlag country={row.country} />{row.nickname}</b>
                  <em>{row.score}</em>
                  {!row.mine && (
                    <button
                      type="button"
                      className="board-more"
                      aria-label={`More actions for ${row.nickname}`}
                      onClick={() => {
                        setSheet(row.nickname);
                        setSheetStep('actions');
                      }}
                    >
                      ⋯
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <button type="button" className="btn primary leaderboard-close" onClick={onClose}>CLOSE</button>
      {sheet && board && (
        <ScreenModal label={`Actions for ${sheet}`} onBackdrop={closeActions}>
          <div className="board-sheet">
            <p className="sheet-name">{sheet}</p>
            {rowSheetStep(sheetStep, {
              onReasons: () => setSheetStep('reasons'),
              onReport: reportName,
              onBlock: blockName,
              onBack: () => setSheetStep('actions'),
              onClose: closeActions,
            })}
          </div>
        </ScreenModal>
      )}
      {notice && (
        <ScreenModal label="Confirmation">
          <div className="centre-notice">
            <p>{notice}</p>
            <button type="button" className="btn primary" onClick={() => setNotice(null)}>OK</button>
          </div>
        </ScreenModal>
      )}
    </div>,
    document.body,
  );
}

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <label className="volume">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value}>
      <span>{label}</span><b>{value ? 'ON' : 'OFF'}</b>
    </button>
  );
}

function graphicsLabel(choice: GraphicsChoice): string {
  switch (choice) {
    case 'auto': return 'AUTO';
    case 'low': return 'LOW';
    case 'medium': return 'MEDIUM';
    case 'high': return 'HIGH';
    default: {
      const neverChoice: never = choice;
      return neverChoice;
    }
  }
}

export function SettingsScreen({
  settings, nickname, country, leaderboardOn, blockedTick, onNickname, onCountry, onLeaderboard, onUnblock, onDelete, onData, onKitColours, onPeek, onSuggest, board, onChange, onToggleSong, onClose,
}: {
  settings: Settings;
  nickname: string;
  country: string | null;
  leaderboardOn: boolean;
  blockedTick: number;
  onNickname: (adjective: string, noun: string) => void | string | Promise<void | string | undefined>;
  onCountry: (country: string | null) => void | string | Promise<void | string | undefined>;
  onLeaderboard: (on: boolean) => void;
  onUnblock: () => void;
  onDelete: () => Promise<string | void>;
  onData: () => void;
  onKitColours: () => void;
  onPeek?: (adjective: string, noun: string) => Promise<PeekOutcome>;
  onSuggest?: (request: { count: number; adjective: string | null; noun: string | null }) => Promise<FreePair[]>;
  board: LeaderboardService | null;
  onChange: (p: Partial<Settings>) => void;
  onToggleSong: (id: GameTrackId) => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);
  const [doneNotice, setDoneNotice] = useState(false);
  const blocked = readBlockedNames(localStorage);
  void blockedTick;
  const choices: GraphicsChoice[] = ['auto', 'low', 'medium', 'high'];
  const device = useSyncExternalStore(subscribeDevice, getDeviceSnapshot);
  const running = useSyncExternalStore(subscribeRunningTier, getRunningTier);
  const detected = detectTier(device);
  const requested = resolveTier(settings.graphics, detected);
  return (
    <>
    <div className="screen settings">
      <div className="card settings-card">
        <div className="settings-body">
        <h2>SETTINGS</h2>
        <div className="group help">
          <p className="data-contact">
            <a href="mailto:hello@iqappsgroup.co.uk">Contact or report a problem</a>
          </p>
          <p className="panel-note">Players can also report from the … on leaderboard rows.</p>
        </div>
        <div className="group">
          <label>Kit</label>
          <button type="button" className="btn ghost" onClick={onKitColours}>Choose your kit</button>
          <p className="panel-note">Free. Saved on this device. It is not sent with your score.</p>
        </div>
        <Toggle label="Leaderboard" value={leaderboardOn} onChange={onLeaderboard} />
        {blocked.length > 0 && (
          <div className="group">
            <label>Blocked names</label>
            <ul className="unblock-list">
              {blocked.map((name) => (
                <li key={name}>
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (board) board.unblock(name);
                      else writeBlockedNames(localStorage, blocked.filter((item) => item.toLowerCase() !== name.toLowerCase()));
                      onUnblock();
                      setDoneNotice(true);
                    }}
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {leaderboardOn && (
          <div className="group">
            <label>Change nickname</label>
            <NicknameForm initial={nickname} submitLabel="SAVE" onSubmit={onNickname} onPeek={onPeek} onSuggest={onSuggest} />
            <p className="panel-note">Your nickname is picked from our word lists. You can change it once every 7 days.</p>
            <label>Country</label>
            <p className="panel-note">Optional. International is the default. The flag of the country you choose is shown beside your nickname. Choosing International shows no flag. Your kit does not choose it. A country board appears once {COUNTRY_BOARD_MIN} players have joined.</p>
            <CountryChoice initialCountry={country} submitLabel="SAVE" onSubmit={onCountry} />
          </div>
        )}
        <div className="group">
          <button type="button" className="btn ghost" onClick={onData}>Leaderboard &amp; your data</button>
        </div>
        <Toggle label="Sound" value={settings.sound} onChange={(sound) => onChange({ sound })} />
        <Toggle label="Music" value={settings.music} onChange={(music) => onChange({ music })} />
        <VolumeSlider label="Music volume" value={settings.musicVolume} onChange={(musicVolume) => onChange({ musicVolume })} />
        <div className="group">
          <label id="song-ticks-label">Tracks</label>
          <div className="song-ticks" role="group" aria-labelledby="song-ticks-label">
            {GAME_TRACKS.map((track) => {
              const on = settings.enabledSongs.includes(track.id);
              const only = settings.enabledSongs.length === 1;
              return (
                <button
                  key={track.id}
                  type="button"
                  className={`song-tick${on ? ' on' : ''}`}
                  aria-pressed={on}
                  aria-disabled={only && on}
                  onClick={() => {
                    if (only && on) return;
                    onToggleSong(track.id);
                  }}
                >
                  <span className="song-tick-box" aria-hidden="true">{on ? '✓' : ''}</span>
                  {track.title}
                </button>
              );
            })}
          </div>
        </div>
        <Toggle label="SFX & crowd" value={settings.sfx} onChange={(sfx) => onChange({ sfx })} />
        <VolumeSlider label="Sound effects volume" value={settings.sfxVolume} onChange={(sfxVolume) => onChange({ sfxVolume })} />
        <Toggle label="Vibration" value={settings.vibration} onChange={(vibration) => onChange({ vibration })} />
        <Toggle label="Trick hints" value={settings.hints} onChange={(hints) => onChange({ hints })} />
        <div className="group">
          <label>Graphics quality</label>
          <div className="seg graphics">
            {choices.map((choice) => (
              <button
                key={choice}
                className={settings.graphics === choice ? 'on' : ''}
                onClick={() => onChange({ graphics: choice })}
              >
                {graphicsLabel(choice)}
              </button>
            ))}
          </div>
          <p className="tier-note">
            {settings.graphics === 'auto'
              ? `This device starts on ${detected.toUpperCase()}. The choice is saved on this device.`
              : `Saved on this device. Auto would start on ${detected.toUpperCase()}.`}
            {running && running !== requested ? ` Playing on ${running.toUpperCase()} after a slow stretch under 30 fps.` : ''}
          </p>
        </div>
        <div className="group help">
          <label>How to play</label>
          <p>Tap <b>left</b> or <b>right</b> of the screen to kick with that foot just as the ball drops to the foot. A perfect touch is worth more than switching feet (+2). Ten clean touches score x2, twenty-five score x3, and fifty score x4.</p>
          <p><b>High kick:</b> press L or R early and hold. A ring fills with power — release as the ball arrives to kick higher and buy time for tricks. A quick tap stays a normal kick.</p>
          <p><b>Foot stall:</b> hold through contact on a good kick, then release to flick for +10.</p>
          <p>Keyboard: <b>A</b>/<b>D</b> feet · <b>H</b> header · <b>N</b> neck (hold) · <b>W</b> ATW · <b>T</b> thigh · <b>F</b> flick · <b>Esc</b> cancel · <b>Space</b> start.</p>
          <p>Tap <b>ATW</b>, <b>THIGH</b>, <b>FLICK</b> or <b>GROOVE</b> once — the trick plays on the next touch. <b>HEAD</b> taps immediately. <b>NECK</b> works on a tap; hold it to stall, then release to flick out. <b>GROOVE</b> is a high kick: your dance plays while the ball is up, then you catch it on the way down. Extra points when that tap is on the beat.</p>
          <p><b>Trick hints</b> call a move, glow the button, and show a tap or a hold. Finish it before the ring empties for bonus points. Turn hints off here once you know the tricks. Each lesson is remembered on this device.</p>
          <p><b>Combos +5:</b> flick→header · header→neck→release · stall→ATW · alternating foot↔thigh. Chains expire if you wait too long or miss.</p>
        </div>
        <div className="group help">
          <label>Privacy</label>
          <PrivacyNotice />
          <p>
            Read the full{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              privacy notice
            </a>
            ,{' '}
            <a href={CHILD_SAFETY_URL} target="_blank" rel="noopener noreferrer">
              child safety statement
            </a>
            {' '}and{' '}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">
              terms of use
            </a>
            .
          </p>
          <p>
            Menu and gameplay music were created by IQ Apps Group using ElevenLabs. If a song file does not load, a synthesised boom-bap beat plays instead. Crowd and cheers are synthesised.{' '}
            <a className="licence-link" href="https://www.iqappsgroup.co.uk/kickole/licences/music" target="_blank" rel="noopener noreferrer">Music licence</a>
            {' · '}
            <a className="licence-link" href="https://www.iqappsgroup.co.uk/kickole/licences/models" target="_blank" rel="noopener noreferrer">Model licence</a>
          </p>
        </div>
        </div>
        <div className="settings-dock">
          {!confirmDelete && (
            <button type="button" className="btn ghost" onClick={() => { setConfirmDelete(true); setDeleteNote(null); }}>
              Delete my leaderboard data
            </button>
          )}
          {confirmDelete && (
            <>
              <p className="panel-note">This removes your nickname and scores. If someone has reported you, we keep that report for up to 90 days.</p>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  void onDelete().then((message) => {
                    if (message) setDeleteNote(message);
                    else {
                      setConfirmDelete(false);
                      setDeleteNote(null);
                      setDoneNotice(true);
                    }
                  });
                }}
              >
                Delete my leaderboard data
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          )}
          {deleteNote && <p className="nick-error" role="alert">{deleteNote}</p>}
          <button className="btn primary" onClick={onClose}>DONE</button>
        </div>
      </div>
    </div>
    {doneNotice && (
      <ScreenModal label="Done">
        <div className="centre-notice">
          <p>{DONE_CONFIRMATION}</p>
          <button type="button" className="btn primary" onClick={() => setDoneNotice(false)}>OK</button>
        </div>
      </ScreenModal>
    )}
    </>
  );
}

export function PauseScreen({
  song, enabledSongs, onSong, onClose,
}: {
  song: SongChoice;
  enabledSongs: readonly GameTrackId[];
  onSong: (song: SongChoice) => void;
  onClose: () => void;
}) {
  const tracks = GAME_TRACKS.filter((track) => enabledSongs.includes(track.id));
  return (
    <div className="screen settings">
      <div className="card">
        <h2>PAUSE</h2>
        <div className="group">
          <label id="pause-song-label">Change song</label>
          <div className="song-list" role="group" aria-labelledby="pause-song-label">
            <button type="button" aria-pressed={song === SHUFFLE_SONG} onClick={() => onSong(SHUFFLE_SONG)}>
              Shuffle
            </button>
            {tracks.map((track) => (
              <button
                key={track.id}
                type="button"
                aria-pressed={song === track.id}
                onClick={() => onSong(track.id)}
              >
                {track.title}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn primary" onClick={onClose}>RESUME</button>
      </div>
    </div>
  );
}

export function DataScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="screen settings">
      <div className="card data-panel">
        <h2>Leaderboard: how it works</h2>
        <ul>
          <li>It&apos;s off unless you turn it on.</li>
          <li>Build a nickname from our word lists, or tap Pick one for me. You can&apos;t type your own, so your real name stays private.</li>
          <li>Country is optional and separate from your kit. International is the default, and you can change or remove it later. The flag of the country you choose is shown beside your nickname. Choosing International shows no flag.</li>
          <li>Boards: Today, Week, Month, Year and All time, for the world and for your country. A country board appears once {COUNTRY_BOARD_MIN} players have joined.</li>
          <li>Your best scores stay until 2 years after you last play. Other runs go after 12 months.</li>
          <li>Tap &apos;Delete my leaderboard data&apos; any time to remove your nickname and scores straight away. If someone has reported you, we keep that report for up to 90 days so we can check it.</li>
          <li>We keep a scrambled version of your internet address for up to 30 days to stop cheating.</li>
          <li>Report or Block a name from the ⋯ button. A report asks you to pick a reason. They won&apos;t be told you reported them. Blocking only changes what you see, and the other player isn&apos;t told. If something upsets you, tell an adult you trust.</li>
        </ul>
        <p className="data-contact">Questions? <a href="mailto:hello@iqappsgroup.co.uk">hello@iqappsgroup.co.uk</a></p>
        <button className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

export function LeaderboardDataScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="screen settings">
      <div className="card data-panel">
        <h2>Leaderboard &amp; your data</h2>
        <p>The leaderboard is off until you join. If you join, a nickname picked from our word lists, a random device id, your score and, if you choose one, a country are sent for the board. Other players see that nickname, your score, and the flag of the country you chose. Choosing International shows no flag.</p>
        <p>We do not collect advertising identifiers for tracking. We do not use GPS or a network lookup to pick your country. A scrambled version of your internet address is kept for up to 30 days to stop cheating.</p>
        <p>Your best scores stay until 2 years after you last play. Other runs go after 12 months. A country board appears once {COUNTRY_BOARD_MIN} players have joined.</p>
        <p>Tap Delete my leaderboard data to remove your nickname and scores straight away. If someone has reported you, we keep that report for up to 90 days so we can check it.</p>
        <p>Report or Block a name from the ⋯ button. Blocking only changes what you see, and the other player isn&apos;t told. If something upsets you, tell an adult you trust.</p>
        <p className="data-contact">Questions? <a href="mailto:hello@iqappsgroup.co.uk">hello@iqappsgroup.co.uk</a></p>
        <button className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

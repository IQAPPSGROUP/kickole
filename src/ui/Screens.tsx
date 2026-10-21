import { useState, useSyncExternalStore } from 'react';
import type { Result } from '../game/controller';
import { countryByCode } from '../game/countries';
import { readBlockedNames, writeBlockedNames, type BoardEntry, type BoardPeriod, type BoardScope, type LeaderboardService } from '../game/leaderboard';
import type { FreePair } from '../game/nickname';
import type { PeekOutcome } from '../game/supabaseLeaderboard';
import type { GraphicsChoice, Settings } from '../game/storage';
import { NicknameForm } from './NicknameScreen';
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
  best, coins, onPlay, onSettings, onCustomise, onShop,
}: {
  best: number;
  coins: number;
  onPlay: () => void;
  onSettings: () => void;
  onCustomise: () => void;
  onShop: () => void;
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
          <div className="best-pill">COINS <b>{coins}</b></div>
        </div>
        <button className="btn primary big" onClick={onPlay}>LET’S PLAY <span aria-hidden="true">↗</span></button>
        <div className="home-actions">
          <button className="btn ghost" onClick={onCustomise}>CUSTOMISE</button>
          <button className="btn ghost" onClick={onShop}>SHOP</button>
        </div>
        <button className="btn ghost" onClick={onSettings}>SETTINGS</button>
        <p className="home-help">Tap to juggle · Hold L or R to kick higher · Hold through the ball to stall</p>
        <p className="credit">IQ Apps Group · v0.1</p>
      </div>
    </div>
  );
}

export function GameOver({
  result, best, coins, board, onAgain, onHome, onShop,
}: {
  result: Result;
  best: number;
  coins: number;
  board: LeaderboardService | null;
  onAgain: () => void;
  onHome: () => void;
  onShop: () => void;
}) {
  const [period, setPeriod] = useState<BoardPeriod>('all');
  const [scope, setScope] = useState<BoardScope>('world');
  const [view, setView] = useState<'around' | 'top'>('around');
  const [note, setNote] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [confirmReport, setConfirmReport] = useState(false);
  const [revision, setRevision] = useState(0);
  void useSyncExternalStore(
    board ? board.subscribe : idleSubscribe,
    () => board?.revision ?? 0,
  );
  const page = board ? board.board(period, scope, result.score, 10) : { hidden: false, rows: [] as BoardEntry[] };
  const optedOut = scope === 'country' && !board?.country;
  const rows = board && !optedOut && !page.hidden
    ? view === 'top'
      ? page.rows
      : flattenAround(board, result.score, scope, period)
    : [];
  void revision;
  return (
    <div className="screen over">
      <div className="card over-card">
        <h2>{result.newBest ? 'NEW BEST!' : 'GAME OVER'}</h2>
        <div className="final">{result.score}</div>
        <p className="coin-earn">+{result.coinsEarned} COINS · {coins} SAVED</p>
        <div className="stats">
          <div><b>{result.kickUps}</b><span>KICK-UPS</span></div>
          <div><b>{best}</b><span>BEST</span></div>
          <div><b>{result.bestStreak}</b><span>BEST COMBO</span></div>
        </div>
        {board && (
          <div className="world-board">
            <div className="period-scroller" role="tablist" aria-label="Board period">
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
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
                  className={scope === id ? 'on' : ''}
                  onClick={() => setScope(id)}
                >
                  {id === 'world' ? 'World' : 'Country'}
                </button>
              ))}
            </div>
            {!optedOut && (
              <div className="seg board-tabs" role="tablist" aria-label="Board view">
                <button type="button" className={view === 'around' ? 'on' : ''} onClick={() => setView('around')}>AROUND YOU</button>
                <button type="button" className={view === 'top' ? 'on' : ''} onClick={() => setView('top')}>TOP 10</button>
              </div>
            )}
            {optedOut && <p className="shop-note">You chose not to appear on a country board.</p>}
            {!optedOut && page.hidden && <p className="shop-note">Not enough players in your country yet</p>}
            {!optedOut && !page.hidden && <ol className="board">
              {rows.map((row) => (
                <li key={`${period}:${scope}:${view}:${row.rank}:${row.nickname}`} className={row.mine ? 'me' : ''} aria-label={entryLabel(row)}>
                  <span>{row.rank > 0 ? row.rank.toLocaleString('en-US') : '—'}</span>
                  <b>{row.nickname}</b>
                  <em>{row.score}</em>
                  {!row.mine && (
                    <button
                      type="button"
                      className="board-more"
                      aria-label={`More actions for ${row.nickname}`}
                      onClick={() => {
                        setSheet(row.nickname);
                        setConfirmReport(false);
                      }}
                    >
                      ⋯
                    </button>
                  )}
                </li>
              ))}
            </ol>}
            {sheet && board && (
              <div className="board-sheet" role="dialog" aria-label={`Actions for ${sheet}`}>
                <p>{sheet}</p>
                {confirmReport ? (
                  <>
                    <p>Report this nickname?</p>
                    <button type="button" onClick={() => setConfirmReport(false)}>Cancel</button>
                    <button
                      type="button"
                      className="sheet-report"
                      onClick={() => {
                        board.report(sheet);
                        setNote('Reported. Hidden on this device.');
                        setSheet(null);
                        setRevision((value) => value + 1);
                      }}
                    >
                      Report
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="sheet-report" onClick={() => setConfirmReport(true)}>Report</button>
                    <button
                      type="button"
                      className="sheet-block"
                      onClick={() => {
                        board.block(sheet);
                        setNote('Blocked. Hidden on this device.');
                        setSheet(null);
                        setRevision((value) => value + 1);
                      }}
                    >
                      Block
                    </button>
                    <button type="button" onClick={() => setSheet(null)}>Close</button>
                  </>
                )}
              </div>
            )}
            {note && <p className="shop-note">{note}</p>}
          </div>
        )}
        <button className="btn primary big" onClick={onAgain} autoFocus>PLAY AGAIN</button>
        <div className="home-actions">
          <button className="btn ghost" onClick={onShop}>SHOP</button>
          <button className="btn ghost" onClick={onHome}>HOME</button>
        </div>
      </div>
    </div>
  );
}

function idleSubscribe(): () => void {
  return () => {};
}

const PERIODS: readonly { id: BoardPeriod; label: string; title?: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week', title: 'Monday to Sunday UTC' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

function flattenAround(board: LeaderboardService, score: number, scope: BoardScope, period: BoardPeriod) {
  const around = board.around(score, scope, period);
  return [...around.above, around.me, ...around.below];
}

function entryLabel(row: BoardEntry): string {
  const country = row.country ? countryByCode(row.country)?.name : null;
  return [String(row.rank), country, row.nickname, String(row.score)].filter((part) => part != null && part !== '').join(' ');
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
  settings, nickname, country, leaderboardOn, blockedTick,   onNickname, onLeaderboard, onUnblock, onDelete, onData, onPeek, onSuggest, board, onChange, onClose,
}: {
  settings: Settings;
  nickname: string;
  country: string | null;
  leaderboardOn: boolean;
  blockedTick: number;
  onNickname: (adjective: string, noun: string, country: string | null) => void | string | Promise<void | string | undefined>;
  onLeaderboard: (on: boolean) => void;
  onUnblock: () => void;
  onDelete: () => Promise<string | void>;
  onData: () => void;
  onPeek?: (adjective: string, noun: string) => Promise<PeekOutcome>;
  onSuggest?: (request: { count: number; adjective: string | null; noun: string | null }) => Promise<FreePair[]>;
  board: LeaderboardService | null;
  onChange: (p: Partial<Settings>) => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);
  const blocked = readBlockedNames(localStorage);
  void blockedTick;
  const choices: GraphicsChoice[] = ['auto', 'low', 'medium', 'high'];
  const device = useSyncExternalStore(subscribeDevice, getDeviceSnapshot);
  const running = useSyncExternalStore(subscribeRunningTier, getRunningTier);
  const detected = detectTier(device);
  const requested = resolveTier(settings.graphics, detected);
  return (
    <div className="screen settings">
      <div className="card">
        <h2>SETTINGS</h2>
        <Toggle label="Leaderboard" value={leaderboardOn} onChange={onLeaderboard} />
        {leaderboardOn && (
          <div className="group">
            <label>Change nickname and country</label>
            <NicknameForm initial={nickname} initialCountry={country} submitLabel="SAVE" onSubmit={onNickname} onPeek={onPeek} onSuggest={onSuggest} />
            <p className="shop-note">Your nickname is picked from our word lists. You can change it once every 7 days. Country is your choice, not your location. Prefer not to say keeps you off country boards.</p>
          </div>
        )}
        {blocked.length > 0 && (
          <div className="group">
            <label>Blocked nicknames</label>
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
                    }}
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="group">
          <button type="button" className="btn ghost" onClick={onData}>Leaderboard &amp; your data</button>
          {!confirmDelete && (
            <button type="button" className="btn ghost" onClick={() => { setConfirmDelete(true); setDeleteNote(null); }}>
              Delete my leaderboard data
            </button>
          )}
          {confirmDelete && (
            <>
              <p className="shop-note">This removes your nickname and scores. If someone has reported you, we keep that report for up to 90 days.</p>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  void onDelete().then((message) => {
                    if (message) setDeleteNote(message);
                    else setConfirmDelete(false);
                  });
                }}
              >
                Delete my leaderboard data
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          )}
          {deleteNote && <p className="nick-error" role="alert">{deleteNote}</p>}
        </div>
        <Toggle label="Sound" value={settings.sound} onChange={(sound) => onChange({ sound })} />
        <Toggle label="Music" value={settings.music} onChange={(music) => onChange({ music })} />
        <Toggle label="SFX & crowd" value={settings.sfx} onChange={(sfx) => onChange({ sfx })} />
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
          <p><b>Coins</b> are earned from run score and spent in the Shop. Customise looks are free. Boots and kits never change timing.</p>
          <p>Keyboard: <b>A</b>/<b>D</b> feet · <b>H</b> header · <b>N</b> neck (hold) · <b>W</b> ATW · <b>T</b> thigh · <b>F</b> flick · <b>Esc</b> cancel · <b>Space</b> start.</p>
          <p>Tap <b>ATW</b>, <b>THIGH</b>, <b>FLICK</b> or <b>GROOVE</b> once — the trick plays on the next touch. <b>HEAD</b> taps immediately. <b>NECK</b> works on a tap; hold it to stall, then release to flick out. <b>GROOVE</b> is a high kick: your dance plays while the ball is up, then you catch it on the way down. Extra points when that tap is on the beat.</p>
          <p><b>Trick hints</b> call a move, glow the button, and show a tap or a hold. Finish it before the ring empties for bonus points. Turn hints off here once you know the tricks. Each lesson is remembered on this device.</p>
          <p><b>Combos +5:</b> flick→header · header→neck→release · stall→ATW · alternating foot↔thigh. Chains expire if you wait too long or miss.</p>
        </div>
        <div className="group help">
          <label>Purchases &amp; privacy</label>
          <p>
            <b>Kickolé Launch Collection</b> is an optional one-time in-app purchase on the iOS App Store and Google Play.
            It unlocks only the launch boots and kits. There are no subscriptions, loot boxes or consumable coin packs.
            Free customisation (skin tone, hair, basic colours) stays free. Purchases are processed by Apple or Google;
            IQ Apps Group does not receive your card details. Restore Purchases reloads entitlement for the same store account.
            Apple and Google purchases do not transfer between stores. Refunds are handled by the store and may remove paid unlocks
            without deleting items you earned with coins.
          </p>
          <p>
            Coins, appearance and purchases stay on this device. The leaderboard is off until you join. If you join, a nickname picked from our word lists, a random device id, your score and the country you choose are sent for the board.
            We do not collect advertising identifiers for tracking. We do not use GPS or a network lookup to pick your country. A hashed IP address may be kept for 30 days to limit cheating.
            Purchases are verified with Apple or Google on the device; we do not log purchase tokens, receipts or credentials.
            Tap Delete my leaderboard data to remove your nickname and scores. Store privacy declarations are documented for release builds.
          </p>
          <p>The Kickolé footballer is adapted from Universal Base Characters by Quaternius, released under CC0 1.0 Universal. Character modifications, kit and game integration by IQ Apps Group.</p>
          <p>Music is a synthesised boom-bap beat. Crowd and cheers are synthesised too. No recorded samples are shipped. See public/audio/LICENSE.txt.</p>
          <p>
            Original assets:{' '}
            <a href="https://quaternius.com/packs/universalbasecharacters.html" target="_blank" rel="noopener noreferrer">
              quaternius.com/packs/universalbasecharacters.html
            </a>
          </p>
          <p>
            CC0:{' '}
            <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer">
              creativecommons.org/publicdomain/zero/1.0/
            </a>
          </p>
        </div>
        <button className="btn primary" onClick={onClose}>DONE</button>
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
          <li>Boards: Today, Week, Month, Year and All time, for the world and for your country. A country board only shows once it has 20 players.</li>
          <li>Your best scores stay until 2 years after you last play. Other runs go after 12 months.</li>
          <li>Tap &apos;Delete my leaderboard data&apos; any time to remove everything straight away.</li>
          <li>We keep a scrambled version of your internet address for up to 30 days to stop cheating.</li>
          <li>Report or Block a name from the ⋯ button. Blocking only changes what you see, and the other player isn&apos;t told. If something upsets you, tell an adult you trust.</li>
        </ul>
        <p className="data-contact">Questions? <a href="mailto:hello@iqcoaching.co.uk">hello@iqcoaching.co.uk</a></p>
        <button className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

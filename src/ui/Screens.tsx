import { useState, useSyncExternalStore } from 'react';
import type { Result } from '../game/controller';
import type { BoardScope, LeaderboardService } from '../game/leaderboard';
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
  const [scope, setScope] = useState<BoardScope>('world');
  const [view, setView] = useState<'around' | 'top'>('around');
  const [note, setNote] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const rows = board
    ? view === 'top'
      ? board.top(scope, result.score, 10)
      : flattenAround(board, result.score, scope)
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
            <div className="seg board-tabs" role="tablist" aria-label="Board scope">
              <button type="button" className={scope === 'world' ? 'on' : ''} onClick={() => setScope('world')}>WORLD</button>
              <button type="button" className={scope === 'week' ? 'on' : ''} onClick={() => setScope('week')}>THIS WEEK</button>
            </div>
            <div className="seg board-tabs" role="tablist" aria-label="Board view">
              <button type="button" className={view === 'around' ? 'on' : ''} onClick={() => setView('around')}>AROUND YOU</button>
              <button type="button" className={view === 'top' ? 'on' : ''} onClick={() => setView('top')}>TOP 10</button>
            </div>
            <ol className="board">
              {rows.map((row) => (
                <li key={`${scope}:${view}:${row.rank}:${row.nickname}`} className={row.mine ? 'me' : ''}>
                  <span>{row.rank}</span>
                  <b>{row.nickname}</b>
                  <em>{row.score}</em>
                  {!row.mine && (
                    <button
                      type="button"
                      className="board-report"
                      onClick={() => {
                        board.report(row.nickname);
                        setNote('Reported. Hidden on this device.');
                        setRevision((value) => value + 1);
                      }}
                    >
                      Report
                    </button>
                  )}
                </li>
              ))}
            </ol>
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

function flattenAround(board: LeaderboardService, score: number, scope: BoardScope) {
  const around = board.around(score, scope);
  return [...around.above, around.me, ...around.below];
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
  settings, nickname, onNickname, onChange, onClose,
}: {
  settings: Settings;
  nickname: string;
  onNickname: (nickname: string) => void;
  onChange: (p: Partial<Settings>) => void;
  onClose: () => void;
}) {
  const choices: GraphicsChoice[] = ['auto', 'low', 'medium', 'high'];
  const device = useSyncExternalStore(subscribeDevice, getDeviceSnapshot);
  const running = useSyncExternalStore(subscribeRunningTier, getRunningTier);
  const detected = detectTier(device);
  const requested = resolveTier(settings.graphics, detected);
  return (
    <div className="screen settings">
      <div className="card">
        <h2>SETTINGS</h2>
        <div className="group">
          <label>World nickname</label>
          <NicknameForm initial={nickname} submitLabel="SAVE NICKNAME" onSubmit={onNickname} />
          <p className="shop-note">Stored on this device. World scores are not uploaded yet.</p>
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
            Play data (scores, coins, appearance) stays on this device in local storage and is not uploaded to IQ Apps Group servers.
            We do not collect advertising identifiers for tracking. Purchases are verified with Apple or Google on the device;
            we do not log purchase tokens, receipts or credentials. Store privacy / Data Safety declarations for listings are documented for release builds.
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

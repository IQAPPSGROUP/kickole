import type { Result } from '../game/controller';
import { SKINS } from '../game/skins';
import type { Quality, RunRecord, Settings } from '../game/storage';

export function Logo() {
  return (
    <h1 className="logo">
      KICK<span>OLÉ</span>
    </h1>
  );
}

export function Home({ best, onPlay, onSettings }: { best: number; onPlay: () => void; onSettings: () => void }) {
  return (
    <div className="screen home">
      <div className="home-top">
        <p className="court-label">FUTEBOL DE RUA <span>•</span> STREET FREESTYLE</p>
        <Logo />
        <p className="tagline">Find your rhythm. Own the court.</p>
      </div>
      <div className="home-bottom">
        <div className="best-pill">PERSONAL BEST <b>{best}</b></div>
        <button className="btn primary big" onClick={onPlay}>LET’S PLAY <span aria-hidden="true">↗</span></button>
        <button className="btn ghost" onClick={onSettings}>SETTINGS</button>
        <p className="home-help">Tap to juggle · Hold to stall</p>
        <p className="credit">IQ Apps Group · v0.1</p>
      </div>
    </div>
  );
}

export function GameOver({
  result, best, leaderboard, onAgain, onHome,
}: { result: Result; best: number; leaderboard: RunRecord[]; onAgain: () => void; onHome: () => void }) {
  return (
    <div className="screen over">
      <div className="card">
        <h2>{result.newBest ? 'NEW BEST!' : 'GAME OVER'}</h2>
        <div className="final">{result.score}</div>
        <div className="stats">
          <div><b>{result.kickUps}</b><span>KICK-UPS</span></div>
          <div><b>{best}</b><span>BEST</span></div>
          <div><b>{result.bestStreak}</b><span>BEST COMBO</span></div>
        </div>
        <ol className="board">
          {leaderboard.map((r, i) => (
            <li key={r.date + '-' + i} className={i === result.rank ? 'me' : ''}>
              <span>{i + 1}</span><b>{r.score}</b><em>{r.kickUps} kicks</em>
            </li>
          ))}
        </ol>
        <button className="btn primary big" onClick={onAgain} autoFocus>PLAY AGAIN</button>
        <button className="btn ghost" onClick={onHome}>HOME</button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value}>
      <span>{label}</span><b>{value ? 'ON' : 'OFF'}</b>
    </button>
  );
}

export function SettingsScreen({
  settings, onChange, onClose,
}: { settings: Settings; onChange: (p: Partial<Settings>) => void; onClose: () => void }) {
  const qualities: Quality[] = ['low', 'medium', 'high'];
  return (
    <div className="screen settings">
      <div className="card">
        <h2>SETTINGS</h2>
        <Toggle label="Sound" value={settings.sound} onChange={(sound) => onChange({ sound })} />
        <Toggle label="Vibration" value={settings.vibration} onChange={(vibration) => onChange({ vibration })} />
        <div className="group">
          <label>Graphics quality</label>
          <div className="seg">
            {qualities.map((q) => (
              <button key={q} className={settings.quality === q ? 'on' : ''} onClick={() => onChange({ quality: q })}>
                {q.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="group">
          <label>Player skin</label>
          <div className="seg">
            {SKINS.map((s) => (
              <button key={s.id} className={settings.skinId === s.id ? 'on' : ''} disabled={!s.unlocked} onClick={() => onChange({ skinId: s.id })}>
                <i style={{ background: s.clothing.shirt }} />{s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="group help">
          <label>How to play</label>
          <p>Tap <b>left</b> or <b>right</b> of the screen to kick with that foot just as the ball drops to the foot. Perfect timing earns bonus points; alternate feet for +3.</p>
          <p><b>Foot stall:</b> press and hold on a good kick, then release to flick for +10.</p>
          <p>Keyboard: <b>A</b>/<b>D</b> feet · <b>H</b> header · <b>N</b> neck (hold) · <b>W</b> ATW · <b>T</b> thigh · <b>F</b> flick · <b>Esc</b> cancel · <b>Space</b> start.</p>
          <p>Arm <b>ATW</b> / <b>THIGH</b> / <b>FLICK</b>, then tap left or right. <b>HEAD</b> taps immediately; <b>NECK</b> is press-and-hold, release to flick out.</p>
          <p><b>Combos +5:</b> flick→header · header→neck→release · stall→ATW · alternating foot↔thigh. Chains expire if you wait too long or miss.</p>
        </div>
        <div className="group help">
          <label>Privacy</label>
          <p>The Kickolé footballer is adapted from Universal Base Characters by Quaternius, released under CC0 1.0 Universal. Character modifications, kit and game integration by IQ Apps Group.</p>
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

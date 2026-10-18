import type { Result } from '../game/controller';
import { coinsForScore, BOOTS } from '../game/boots';
import { SCENES, type GameScene } from '../game/scenes';
import { SKINS } from '../game/skins';
import type { Quality, RunRecord, SaveData, Settings } from '../game/storage';
import { WorldBoard } from './WorldBoard';

export function Logo() {
  return (
    <h1 className="logo">
      KICK<span>OLÉ</span>
    </h1>
  );
}

export function Home({ best, coins, scene, onPlay, onSettings, onShop }: { best: number; coins: number; scene: GameScene; onPlay: () => void; onSettings: () => void; onShop: () => void }) {
  return (
    <div className="screen home">
      <div className="home-top">
        <p className="court-label">{scene.place} <span>•</span> {scene.subtitle}</p>
        <Logo />
        <p className="tagline">Find your rhythm. Own the court.</p>
      </div>
      <div className="home-bottom">
        <div className="best-pill">PERSONAL BEST <b>{best}</b></div>
        <div className="best-pill">COINS <b>{coins}</b></div>
        <button className="btn primary big" onClick={onPlay}>LET’S PLAY <span aria-hidden="true">↗</span></button>
        <button className="btn ghost" onClick={onShop}>BOOT SHOP</button>
        <button className="btn ghost" onClick={onSettings}>SETTINGS</button>
        <p className="home-help">Tap to juggle · Hold to stall</p>
        <p className="credit">IQ Apps Group · v0.1</p>
      </div>
    </div>
  );
}

export function GameOver({
  result, best, coins, nickname, leaderboard, onAgain, onHome, onShop,
}: {
  result: Result;
  best: number;
  coins: number;
  nickname: string;
  leaderboard: RunRecord[];
  onAgain: () => void;
  onHome: () => void;
  onShop: () => void;
}) {
  return (
    <div className="screen over">
      <div className="card">
        <h2>{result.newBest ? 'NEW BEST!' : 'GAME OVER'}</h2>
        <div className="final">{result.score}</div>
        <p className="coin-earn">+{coinsForScore(result.score)} COINS · {coins} SAVED</p>
        <div className="stats">
          <div><b>{result.kickUps}</b><span>KICK-UPS</span></div>
          <div><b>{best}</b><span>BEST</span></div>
          <div><b>{result.bestStreak}</b><span>BEST COMBO</span></div>
        </div>
        <WorldBoard nickname={nickname} score={result.score} best={best} />
        <ol className="board">
          {leaderboard.map((r, i) => (
            <li key={r.date + '-' + i} className={i === result.rank ? 'me' : ''}>
              <span>{i + 1}</span><b>{r.score}</b><em>{r.kickUps} kicks</em>
            </li>
          ))}
        </ol>
        <button className="btn primary big" onClick={onAgain} autoFocus>PLAY AGAIN</button>
        <button className="btn ghost" onClick={onShop}>BOOT SHOP</button>
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
        <div className="group">
          <label>Scene</label>
          <div className="seg">
            {SCENES.map((scene) => (
              <button key={scene.id} className={settings.sceneId === scene.id ? 'on' : ''} onClick={() => onChange({ sceneId: scene.id })}>
                {scene.name}
              </button>
            ))}
          </div>
        </div>
        <Toggle label="Sound" value={settings.sound} onChange={(sound) => onChange({ sound })} />
        <div className="group">
          <label htmlFor="nickname">Nickname</label>
          <input
            id="nickname"
            className="nick"
            maxLength={12}
            value={settings.nickname}
            autoComplete="nickname"
            onChange={(e) => onChange({ nickname: e.target.value })}
          />
        </div>
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
          <p>Keyboard: <b>A</b> left foot · <b>D</b> right foot · <b>Space</b> start/restart.</p>
        </div>
        <button className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

export function ShopScreen({ save, onBuy, onClose }: { save: SaveData; onBuy: (id: string) => boolean; onClose: () => void }) {
  return (
    <div className="screen settings">
      <div className="card shop-card">
        <h2>BOOT SHOP</h2>
        <p className="shop-lead">Better boots give you more time on the kick. Perfects come easier, so scores can climb. Coins come from your runs.</p>
        <p className="coin-earn">{save.coins} COINS</p>
        <div className="shop-list">
          {BOOTS.map((boot) => {
            const owned = save.ownedBoots.includes(boot.id);
            const equipped = save.equippedBoot === boot.id;
            const afford = owned || save.coins >= boot.price;
            const label = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : afford ? `BUY ${boot.price}` : `${boot.price} COINS`;
            return (
              <button
                key={boot.id}
                className={`boot ${equipped ? 'on' : ''}`}
                disabled={!afford || equipped}
                onClick={() => onBuy(boot.id)}
              >
                <i style={{ background: boot.main, boxShadow: `inset 0 -6px 0 ${boot.sole}` }} />
                <span>
                  <b>{boot.name}</b>
                  <small>{boot.note}{boot.perfectExtra > 0 ? ` +${boot.perfectExtra} ms perfect, +${boot.goodExtra} ms good.` : ''}</small>
                </span>
                <em>{label}</em>
              </button>
            );
          })}
        </div>
        <button className="btn primary" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameController } from '../game/controller';
import type { Side } from '../engine/config';
import { KICK_CLIP_CONTACT_TIME, KICK_CLIP_START } from '../scene/rig';
import { buildScenario, inspector, type InspectInfo, type InspectMode } from '../scene/inspector';

const FRAME = 1 / 30;
const MAX_CLIP = 0.8;

export interface InspectApi {
  set(o: { side?: Side; mode?: InspectMode; t?: number }): InspectInfo;
  info(): { info: InspectInfo; clip: number; foot: [number, number, number] | null; ball: InspectInfo['ball'] };
}

/** Development-only animation inspector (open the game with ?inspect). Pause, step and scrub kick / stall animation. */
export function InspectorPanel({ controller }: { controller: GameController }) {
  const [side, setSide] = useState<Side>('left');
  const [mode, setMode] = useState<InspectMode>('kick');
  // kick: clip time in seconds. stall: seconds since the tap.
  const [t, setT] = useState(KICK_CLIP_CONTACT_TIME);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState<InspectInfo | null>(null);
  const [foot, setFoot] = useState<[number, number, number] | null>(null);
  const [perf, setPerf] = useState('');
  const state = useRef({ side, mode, t });
  state.current = { side, mode, t };

  const apply = useCallback((s: Side, m: InspectMode, value: number) => {
    const sinceTap = m === 'kick' ? value - KICK_CLIP_START : value;
    const r = buildScenario(controller.engine, s, m, sinceTap);
    controller.refresh();
    setInfo(r);
    return r;
  }, [controller]);

  useEffect(() => {
    inspector.active = true;
    controller.play();
    return () => { inspector.active = false; controller.home(); };
  }, [controller]);

  useEffect(() => { apply(side, mode, t); }, [side, mode, t, apply]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setT((v) => { const lim = state.current.mode === 'kick' ? MAX_CLIP : 1.4; const n = v + dt; return n > lim ? 0 : n; });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Frame-time / heap readout so the same panel can be opened on a phone (dev server on the LAN).
  useEffect(() => {
    const d: number[] = []; let last = performance.now(); let raf = 0;
    const loop = (now: number) => { d.push(now - last); last = now; if (d.length > 120) d.shift(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const id = window.setInterval(() => {
      if (d.length < 10) return;
      const sorted = [...d].sort((a, b) => a - b);
      const avg = d.reduce((a, b) => a + b, 0) / d.length;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      setPerf(`${(1000 / avg).toFixed(0)} fps  avg ${avg.toFixed(1)} ms  p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)} ms${mem ? `  heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''}`);
    }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setFoot(inspector.foot), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const api: InspectApi = {
      set: (o) => {
        const s = o.side ?? state.current.side; const m = o.mode ?? state.current.mode; const v = o.t ?? state.current.t;
        setPlaying(false); setSide(s); setMode(m); setT(v);
        return apply(s, m, v);
      },
      info: () => ({ info: apply(state.current.side, state.current.mode, state.current.t), clip: state.current.t, foot: inspector.foot, ball: { ...controller.engine.ball, vy: controller.engine.ball.vy } }),
    };
    (window as unknown as { __inspect?: InspectApi }).__inspect = api;
  }, [apply, controller]);

  const ball = info?.ball;
  const clipShown = mode === 'kick' ? t : null;
  const contactClip = info?.contactAt != null ? KICK_CLIP_START + info.contactAt : null;
  const f = (n: number | undefined) => (n === undefined ? '-' : n.toFixed(3));
  const step = (d: number) => { setPlaying(false); setT((v) => Math.max(mode === 'kick' ? 0 : -0.3, v + d)); };

  return (
    <div className="inspector" onPointerDown={(e) => e.stopPropagation()}>
      <div className="row">
        <button onClick={() => setSide(side === 'left' ? 'right' : 'left')}>{side.toUpperCase()}</button>
        <button onClick={() => { setMode(mode === 'kick' ? 'stall' : 'kick'); setT(mode === 'kick' ? 0 : KICK_CLIP_CONTACT_TIME); }}>{mode.toUpperCase()}</button>
        <button onClick={() => setPlaying(!playing)}>{playing ? 'PAUSE' : 'PLAY'}</button>
        <button onClick={() => step(-FRAME)}>◀ frame</button>
        <button onClick={() => step(FRAME)}>frame ▶</button>
      </div>
      <input type="range" min={mode === 'kick' ? 0 : -0.3} max={mode === 'kick' ? MAX_CLIP : 1.4} step={0.005} value={t}
        onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} />
      {mode === 'kick' && (
        <div className="row">
          {[0.25, 0.3, 0.35].map((v) => <button key={v} onClick={() => { setPlaying(false); setT(v); }}>{v.toFixed(2)}s</button>)}
        </div>
      )}
      <pre>{`${mode === 'kick' ? `clip ${clipShown!.toFixed(3)} s` : `since tap ${t.toFixed(3)} s`}  (tap→response ${info?.contactAt != null ? (info.contactAt * 1000).toFixed(0) + ' ms' : 'pending'})
contact in clip: ${contactClip != null ? contactClip.toFixed(3) + ' s' : 'not yet'}  (target ${KICK_CLIP_CONTACT_TIME.toFixed(2)} s)
ball  x ${f(ball?.x)} y ${f(ball?.y)} z ${f(ball?.z)}  vy ${f(ball?.vy)}
foot  ${foot ? `x ${f(foot[0])} y ${f(foot[1])} z ${f(foot[2])}` : '(GLB off / n/a)'}  phase ${info?.phase ?? '-'}\n${perf}`}</pre>
    </div>
  );
}

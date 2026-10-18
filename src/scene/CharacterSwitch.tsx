import { Component, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';
import { Character } from './Character';
import { GlbCharacter } from './GlbCharacter';
import { CHARACTER_MODEL_URL, USE_GLB_CHARACTER } from './rig';

type Status = 'checking' | 'available' | 'missing';

/** True only when the URL really serves a binary glTF (dev servers return index.html for unknown paths). */
async function modelExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-3' } });
    if (!res.ok || !res.body) return false;
    const reader = res.body.getReader();
    const { value } = await reader.read();
    void reader.cancel();
    return !!value && String.fromCharCode(...value.slice(0, 4)) === 'glTF';
  } catch {
    return false;
  }
}

class GlbBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('Character model failed to load; using fallback.', err); this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * Uses the rigged GLB footballer unless VITE_USE_GLB_CHARACTER=false, provided /models/kicky-player-rigged.glb exists and matches the rig contract,
 * otherwise the built-in primitive character.
 */
export function CharacterSwitch({ engine, skin }: { engine: GameEngine; skin: Skin }) {
  const [status, setStatus] = useState<Status>(USE_GLB_CHARACTER ? 'checking' : 'missing');
  useEffect(() => {
    if (!USE_GLB_CHARACTER) return;
    let live = true;
    void modelExists(CHARACTER_MODEL_URL).then((ok) => { if (live) setStatus(ok ? 'available' : 'missing'); });
    return () => { live = false; };
  }, []);
  const reject = useCallback(() => setStatus('missing'), []);
  const fallback = <Character engine={engine} skin={skin} />;
  if (status !== 'available') return fallback;
  return (
    <GlbBoundary fallback={fallback} onError={reject}>
      <Suspense fallback={fallback}>
        <GlbCharacter engine={engine} skin={skin} onInvalid={reject} />
      </Suspense>
    </GlbBoundary>
  );
}

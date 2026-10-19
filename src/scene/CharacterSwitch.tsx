import { Component, Suspense, useCallback, useState, type ReactNode } from 'react';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { Character } from './Character';
import { GlbCharacter } from './GlbCharacter';
import { USE_GLB_CHARACTER } from './rig';

type Status = 'available' | 'missing';

class GlbBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('Character model failed to load; using fallback.', err); this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * Uses the rigged GLB footballer unless VITE_USE_GLB_CHARACTER=false.
 * The primitive character is only shown if that model fails to load.
 */
export function CharacterSwitch({ engine, skin, quality = 'high' }: { engine: GameEngine; skin: Skin; quality?: Quality }) {
  const [status, setStatus] = useState<Status>(USE_GLB_CHARACTER ? 'available' : 'missing');
  const reject = useCallback(() => setStatus('missing'), []);
  const fallback = <Character engine={engine} skin={skin} />;
  if (status !== 'available') return fallback;
  return (
    <GlbBoundary fallback={fallback} onError={reject}>
      <Suspense fallback={null}>
        <GlbCharacter engine={engine} skin={skin} onInvalid={reject} quality={quality} />
      </Suspense>
    </GlbBoundary>
  );
}

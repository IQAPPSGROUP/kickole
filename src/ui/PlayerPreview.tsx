import { Suspense, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Group, type PerspectiveCamera } from 'three';
import { GameEngine } from '../engine/engine';
import { GAMEPLAY_BPM } from '../game/beat';
import type { DanceId } from '../game/dances';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { CharacterSwitch } from '../scene/CharacterSwitch';
import { getRunningTier, subscribeRunningTier } from '../scene/qualityTier';

/** Picker tile colour. The canvas used to clear to the app violet, which read as an empty box. */
const PREVIEW_BACKDROP = '#1C2B22';

function useRunningQuality(): Quality {
  return useSyncExternalStore(
    subscribeRunningTier,
    () => getRunningTier() ?? 'high',
    () => 'high',
  );
}

function PreviewCamera() {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    (camera as PerspectiveCamera).lookAt(0, 0.2, 0);
  });
  return null;
}

function Turntable({ skin, yaw, dance, quality }: { skin: Skin; yaw: number; dance: DanceId | null; quality: Quality }) {
  const engine = useRef(new GameEngine()).current;
  const group = useRef<Group>(null);
  if (engine.phase === 'menu') {
    engine.prepare('ready');
    engine.phase = 'ready';
    // Idle frame 0 is still the bind pose. Start in the standing part of the clip.
    if (engine.time < 0.4) engine.time = 0.4;
  }
  useFrame((_, dt) => {
    if (dance) {
      engine.phase = 'playing';
      engine.equippedDance = dance;
      engine.selectedTrick = null;
      engine.celebration = null;
      engine.time += dt;
      const dur = engine.config.tricks.grooveDanceSec;
      engine.trick = {
        kind: 'groove', phase: 'execute', side: 'right',
        startedAt: engine.time - (engine.time % dur),
        awarded: true, revolution: 0, held: 0,
      };
      engine.beatPhase = ((engine.time * GAMEPLAY_BPM) / 60) % 1;
    } else {
      if (engine.trick?.kind === 'groove') engine.trick = null;
      engine.phase = 'ready';
      engine.time += dt;
    }
    if (group.current) group.current.rotation.y = yaw;
  });
  return (
    <group ref={group} position={[0, -0.95, 0]}>
      <Suspense fallback={null}>
        <CharacterSwitch engine={engine} skin={skin} quality={quality} />
      </Suspense>
    </group>
  );
}

/** Compact rotatable player preview for Customise / Shop. */
export function PlayerPreview({
  skin,
  closeUp = false,
  label,
  dance = null,
}: {
  skin: Skin;
  closeUp?: boolean;
  label?: string;
  dance?: DanceId | null;
}) {
  const [yaw, setYaw] = useState(0.35);
  const quality = useRunningQuality();
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, yaw };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.01);
  };
  const onUp = () => { drag.current = null; };

  return (
    <div
      className={`player-preview ${closeUp ? 'close-up' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="img"
      aria-label={label ?? 'Player preview — drag to rotate'}
    >
      <Canvas
        key={skin.playerBody}
        camera={{ position: closeUp ? [0.55, 1.45, 1.35] : [0.95, 1.2, 2.15], fov: 32 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[PREVIEW_BACKDROP]} />
        <PreviewCamera />
        <hemisphereLight args={['#D8E2DC', '#1C2B22', 0.9]} />
        <directionalLight position={[2, 4, 3]} intensity={2.2} color="#FFF6E8" />
        <Turntable skin={skin} yaw={yaw} dance={dance ?? null} quality={quality} />
      </Canvas>
      <span className="preview-hint">Drag to rotate</span>
    </div>
  );
}

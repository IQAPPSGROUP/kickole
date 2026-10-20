import { Suspense, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { GameEngine } from '../engine/engine';
import { GAMEPLAY_BPM } from '../game/beat';
import type { DanceId } from '../game/dances';
import type { Skin } from '../game/skins';
import { CharacterSwitch } from '../scene/CharacterSwitch';

function Turntable({ skin, yaw, dance }: { skin: Skin; yaw: number; dance: DanceId | null }) {
  const engine = useRef(new GameEngine()).current;
  const group = useRef<Group>(null);
  if (engine.phase === 'menu') {
    engine.prepare('ready');
    engine.phase = 'ready';
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
    } else if (engine.trick?.kind === 'groove') {
      engine.trick = null;
      engine.phase = 'ready';
    }
    if (group.current) group.current.rotation.y = yaw;
  });
  return (
    <group ref={group} position={[0, -0.95, 0]}>
      <Suspense fallback={null}>
        <CharacterSwitch engine={engine} skin={skin} />
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
        camera={{ position: closeUp ? [0.55, 1.55, 1.35] : [1.1, 1.35, 2.4], fov: 35 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#6C5CE7']} />
        <hemisphereLight args={['#FF8A5B', '#1E2A5A', 0.85]} />
        <directionalLight position={[2, 4, 3]} intensity={2.2} color="#FFF6E8" />
        <Turntable skin={skin} yaw={yaw} dance={dance ?? null} />
      </Canvas>
      <span className="preview-hint">Drag to rotate</span>
    </div>
  );
}

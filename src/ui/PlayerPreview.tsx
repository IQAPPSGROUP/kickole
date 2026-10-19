import { Suspense, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';
import { CharacterSwitch } from '../scene/CharacterSwitch';

function Turntable({ skin, yaw }: { skin: Skin; yaw: number }) {
  const engine = useRef(new GameEngine()).current;
  const group = useRef<Group>(null);
  if (engine.phase === 'menu') {
    engine.prepare('ready');
    engine.phase = 'ready';
  }
  useFrame(() => {
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
}: {
  skin: Skin;
  closeUp?: boolean;
  label?: string;
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
        camera={{ position: closeUp ? [0.55, 1.55, 1.35] : [1.1, 1.35, 2.4], fov: 35 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#0f2a32']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[2, 4, 3]} intensity={2.2} />
        <hemisphereLight args={['#fff4dd', '#3a5a52', 0.9]} />
        <Turntable skin={skin} yaw={yaw} />
      </Canvas>
      <span className="preview-hint">Drag to rotate</span>
    </div>
  );
}

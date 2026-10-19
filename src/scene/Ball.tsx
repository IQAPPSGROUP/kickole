import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, Euler, MeshBasicMaterial, MeshPhysicalMaterial, RepeatWrapping, Vector2, Vector3, type Group, type Mesh } from 'three';
import type { Quality } from '../game/storage';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';

const TRAIL = 6;

/** Stitched leather normal. The panel colour is applied in the fragment shader. */
function leatherNormal(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = 'rgb(128,128,255)';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgb(108,116,255)';
    g.lineWidth = 3;
    for (let x = 16; x < 256; x += 42) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 256);
      g.stroke();
    }
    for (let y = 20; y < 256; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

export function Ball({ engine, skin, quality }: { engine: GameEngine; skin: Skin; quality: Quality }) {
  const trail = useRef<Array<Mesh | null>>([]);
  const hist = useRef<Vector3[]>(Array.from({ length: TRAIL * 2 }, () => new Vector3()));
  const flash = useRef<Mesh>(null);
  const showTrail = quality !== 'low';
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const r = engine.config.ballRadius;
  const euler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), []);
  const panel = useMemo(() => new Color(skin.football.panels), [skin.football.panels]);
  const leather = useMemo(() => {
    const normal = leatherNormal();
    const material = new MeshPhysicalMaterial({
      color: skin.football.base,
      roughness: 0.46,
      metalness: 0,
      clearcoat: 0.62,
      clearcoatRoughness: 0.26,
      normalMap: normal,
      normalScale: new Vector2(0.55, 0.55),
    });
    material.onBeforeCompile = (shader) => {
      material.userData.shader = shader;
      shader.uniforms.uPanel = { value: panel };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uPanel;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float seam = abs(fract(vNormal.x * 3.0 + vNormal.z * 2.0) - 0.5);
          float band = abs(fract(vNormal.y * 4.0) - 0.5);
          float leather = smoothstep(0.16, 0.28, min(seam, band));
          diffuseColor.rgb = mix(uPanel, diffuseColor.rgb, leather);`);
    };
    material.customProgramCacheKey = () => 'kickole-leather';
    return material;
  }, [panel, skin.football.base]);
  useEffect(() => () => {
    leather.normalMap?.dispose();
    leather.dispose();
  }, [leather]);

  useFrame(() => {
    const b = engine.ball;
    if (group.current) group.current.position.set(b.x, b.y, b.z);
    if (spin.current) { euler.set(b.rx, b.ry, b.rz); spin.current.rotation.copy(euler); }
    // Squash is full while the hit-pause holds the contact frame (engine time stays put), then eases out.
    // The spin group is a child, so the panels keep turning inside the flattened ball.
    const since = engine.time - Math.max(engine.lastContact.left, engine.lastContact.right);
    const squashWindow = 0.1;
    const squash = since >= 0 && since < squashWindow && engine.lastKickGrade !== 'miss'
      ? Math.cos((since / squashWindow) * Math.PI * 0.5)
      : 0;
    // Depth stays at 1 so the face against the boot does not grow through the leather.
    if (group.current) group.current.scale.set(1 + 0.045 * squash, 1 - 0.07 * squash, 1);
    if (flash.current) {
      flash.current.visible = squash > 0.04;
      flash.current.scale.setScalar(1 + 0.06 * squash);
      (flash.current.material as unknown as { opacity: number }).opacity = 0.22 * squash;
    }
    if (showTrail) {
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const h = hist.current;
      for (let i = h.length - 1; i > 0; i--) h[i].copy(h[i - 1]);
      h[0].set(b.x, b.y, b.z);
      for (let i = 0; i < TRAIL; i++) {
        const m = trail.current[i];
        if (!m) continue;
        const p = h[(i + 1) * 2 - 1];
        m.visible = speed > 3.2 && engine.phase === 'playing';
        (m.material as MeshBasicMaterial).color.set(engine.streak >= 4 ? '#FFD93D' : '#FF4F9A');
        m.position.copy(p);
        m.scale.setScalar(1 - (i + 1) / (TRAIL + 1));
        (m.material as unknown as { opacity: number }).opacity = 0.28 * (1 - i / TRAIL);
      }
    }
    if (shadow.current) {
      const h = Math.max(0, b.y - r);
      const s = 1 / (1 + h * 0.9);
      shadow.current.position.set(b.x, 0.012, b.z);
      shadow.current.scale.set(s, s, s);
      (shadow.current.material as unknown as { opacity: number }).opacity = 0.4 * s;
    }
  });

  return (
    <>
      <group ref={group}>
        <mesh ref={flash} visible={false}>
          <sphereGeometry args={[r * 1.06, 12, 10]} />
          <meshBasicMaterial color="#FFF1C9" transparent opacity={0} depthWrite={false} />
        </mesh>
        <group ref={spin}>
          <mesh castShadow material={leather}>
            <sphereGeometry args={[r, quality === 'low' ? 24 : 40, quality === 'low' ? 16 : 28]} />
          </mesh>
        </group>
      </group>
      {showTrail && Array.from({ length: TRAIL }, (_, i) => (
        <mesh key={i} ref={(m) => { trail.current[i] = m; }} visible={false}>
          <sphereGeometry args={[r, 12, 10]} />
          <meshBasicMaterial color={engine.streak >= 4 ? '#FFD93D' : '#FF4F9A'} transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 1.25, 24]} />
        <meshBasicMaterial color="#1E2A5A" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </>
  );
}

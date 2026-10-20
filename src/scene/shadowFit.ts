/**
 * Centre of the tight shadow frustum. The player stays put, so the map stays on
 * the body and only leans toward the ball while the ball is still in reach.
 */
export function shadowFocus(
  player: { x: number; z: number },
  ball: { x: number; z: number },
  extent: number,
): [number, number] {
  const dx = ball.x - player.x;
  const dz = ball.z - player.z;
  const reach = Math.hypot(dx, dz);
  const pull = reach < extent * 1.25 ? 0.35 : 0;
  return [player.x + dx * pull, player.z + dz * pull];
}

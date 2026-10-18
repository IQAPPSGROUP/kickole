import { describe, expect, it } from 'vitest';
import { BEACH_BALL_LOOP, CROWD, beachBallPose, birdPose, kickClipsBeachBall, outsideKickCircle } from './set-dressing';

const FLIGHT = { x: 0.1, y: 0.72, z: 0.62, vx: 0.15, vy: 5.6, vz: 0, gravity: 11 };

describe('set dressing', () => {
  it('keeps the bird, beach ball and crowd outside the kick circle', () => {
    for (let step = 0; step < 40; step++) {
      const time = step * 0.4;
      const ball = beachBallPose(time);
      const bird = birdPose(time);
      expect(outsideKickCircle(ball.x, ball.z)).toBe(true);
      expect(ball.x).toBeLessThanOrEqual(-1.7);
      expect(outsideKickCircle(bird.x, bird.z)).toBe(true);
    }
    for (const scene of [CROWD.beach, CROWD.rua]) {
      for (const spot of scene) expect(outsideKickCircle(spot.x, spot.z)).toBe(true);
    }
  });

  it('pops once when a kick passes the beach ball and again only on the next loop', () => {
    const close = 0.55 * BEACH_BALL_LOOP;
    const hit = kickClipsBeachBall({ ...FLIGHT, time: close }, -1);
    expect(hit.bonus).toBe(5);
    expect(kickClipsBeachBall({ ...FLIGHT, time: close }, hit.loop).bonus).toBe(0);
    expect(kickClipsBeachBall({ ...FLIGHT, time: 0 }, -1).bonus).toBe(0);
    const later = kickClipsBeachBall({ ...FLIGHT, time: close + BEACH_BALL_LOOP }, hit.loop);
    expect(later.bonus).toBe(5);
    expect(later.loop).toBe(hit.loop + 1);
  });
});

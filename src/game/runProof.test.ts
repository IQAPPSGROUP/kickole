import { describe, expect, it } from 'vitest';
import { kickTimesText, runChecksum } from './runProof';

describe('run checksum', () => {
  it('binds the score, kick count, and timestamps', () => {
    const base = {
      deviceId: '00000000-0000-4000-8000-0000000000B2',
      token: '22222222-2222-4222-8222-222222222222',
      score: 12,
      kickCount: 3,
      durationMs: 4000,
      kickTimes: '120,480,900',
    };
    const first = runChecksum(base);
    expect(first).toBe('c9147b6b');
    expect(runChecksum({ ...base, deviceId: base.deviceId.toLowerCase() })).toBe(first);
    expect(runChecksum({ ...base, score: 13 })).not.toBe(first);
    expect(runChecksum({ ...base, kickTimes: '120,480,901' })).not.toBe(first);
    expect(kickTimesText([120.8, 480, -1])).toBe('120,480,0');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpactStyle, NotificationType } from '@capacitor/haptics';

const impact = vi.hoisted(() => vi.fn());
const notification = vi.hoisted(() => vi.fn());
const isNativePlatform = vi.hoisted(() => vi.fn(() => false));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: (options?: { style: string }) => impact(options),
    notification: (options?: { type: string }) => notification(options),
  },
  ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

import { playHaptic, vibratePattern } from './haptics';

describe('haptics', () => {
  beforeEach(() => {
    impact.mockClear();
    notification.mockClear();
    impact.mockResolvedValue(undefined);
    isNativePlatform.mockReturnValue(false);
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
  });

  it('keeps perfect, good, poor and miss patterns distinct', () => {
    const cues = ['perfect', 'good', 'poor', 'miss'] as const;
    const patterns = cues.map((cue) => JSON.stringify(vibratePattern(cue)));
    expect(new Set(patterns).size).toBe(cues.length);
  });

  it('does nothing when vibration is off', async () => {
    await playHaptic('perfect', false);
    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });

  it('falls back to vibrate on the web', async () => {
    await playHaptic('perfect', true);
    await playHaptic('good', true);
    await playHaptic('poor', true);
    await playHaptic('miss', true);
    expect(navigator.vibrate).toHaveBeenNthCalledWith(1, vibratePattern('perfect'));
    expect(navigator.vibrate).toHaveBeenNthCalledWith(2, vibratePattern('good'));
    expect(navigator.vibrate).toHaveBeenNthCalledWith(3, vibratePattern('poor'));
    expect(navigator.vibrate).toHaveBeenNthCalledWith(4, vibratePattern('miss'));
    expect(impact).not.toHaveBeenCalled();
  });

  it('uses a strong impact for perfect, a light one for good, and notifications for poor and miss', async () => {
    isNativePlatform.mockReturnValue(true);
    await playHaptic('perfect', true);
    await playHaptic('good', true);
    await playHaptic('poor', true);
    await playHaptic('miss', true);
    expect(impact).toHaveBeenNthCalledWith(1, { style: ImpactStyle.Heavy });
    expect(impact).toHaveBeenNthCalledWith(2, { style: ImpactStyle.Light });
    expect(notification).toHaveBeenNthCalledWith(1, { type: NotificationType.Warning });
    expect(notification).toHaveBeenNthCalledWith(2, { type: NotificationType.Error });
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('uses vibrate when the native plugin fails', async () => {
    isNativePlatform.mockReturnValue(true);
    impact.mockRejectedValueOnce(new Error('unavailable'));
    await playHaptic('perfect', true);
    expect(navigator.vibrate).toHaveBeenCalledWith(vibratePattern('perfect'));
  });
});

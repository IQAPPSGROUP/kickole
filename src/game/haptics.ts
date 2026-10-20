import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** A hit-quality buzz. Perfect is the strong impact; poor and miss are different notifications. */
export type HapticCue = 'launch' | 'perfect' | 'good' | 'poor' | 'miss' | 'combo' | 'drop';

/** Web fallback patterns. Each cue is distinct so a miss does not feel like a good touch. */
export function vibratePattern(cue: HapticCue): number | number[] {
  switch (cue) {
    case 'launch': return 15;
    case 'perfect': return [20, 30, 24];
    case 'good': return 12;
    case 'poor': return [10, 40, 16];
    case 'miss': return [36, 50, 36];
    case 'combo': return [12, 28, 16];
    case 'drop': return [50, 40, 70];
    default: {
      const unexpected: never = cue;
      return unexpected;
    }
  }
}

/** Native impact or notification for a cue. Throws when the plugin is unavailable. */
async function nativeCue(cue: HapticCue): Promise<void> {
  switch (cue) {
    case 'perfect':
      await Haptics.impact({ style: ImpactStyle.Heavy });
      return;
    case 'launch':
    case 'combo':
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    case 'good':
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    case 'poor':
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    case 'miss':
    case 'drop':
      await Haptics.notification({ type: NotificationType.Error });
      return;
    default: {
      const unexpected: never = cue;
      return unexpected;
    }
  }
}

function vibrateWeb(cue: HapticCue): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(vibratePattern(cue)); } catch { /* unsupported */ }
}

/**
 * Buzz for a gameplay cue when Vibration is on.
 * Phones use Capacitor haptics. The browser, and a failed native call, use vibrate.
 */
export function playHaptic(cue: HapticCue, enabled: boolean): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (Capacitor.isNativePlatform()) {
    return nativeCue(cue).catch(() => { vibrateWeb(cue); });
  }
  vibrateWeb(cue);
  return Promise.resolve();
}

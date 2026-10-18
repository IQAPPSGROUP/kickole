/** Playback rate for the beach loop. Physics and the timing window stay put. */
export const SAMBA_MIN = 1;
export const SAMBA_MAX = 1.35;

/** Each perfect in a row adds a little tempo, capped so the loop stays musical. */
export function sambaRate(perfectStreak: number): number {
  if (!Number.isFinite(perfectStreak) || perfectStreak <= 0) return SAMBA_MIN;
  return Math.min(SAMBA_MAX, SAMBA_MIN + Math.min(Math.floor(perfectStreak), 7) * 0.05);
}

/** Glide toward the target rate so a miss eases off instead of snapping. */
export function easeSamba(current: number, target: number): number {
  const clamped = Math.min(SAMBA_MAX, Math.max(SAMBA_MIN, Number.isFinite(target) ? target : SAMBA_MIN));
  const now = Number.isFinite(current) ? current : SAMBA_MIN;
  const next = now + (clamped - now) * 0.35;
  return Math.abs(next - clamped) < 0.008 ? clamped : next;
}

import type { Side } from '../engine/config';

/** Added when the successful kick matches the called foot. The other foot still scores. */
export const CALLED_FOOT_BONUS = 2;

/**
 * Foot to flash for this kick-up number.
 * The first call is kick 3, then every 4th kick after that: 3, 7, 11, 15…
 * The side alternates and is fully determined by the kick number.
 */
export function calledFootForKick(kickNumber: number): Side | null {
  if (!Number.isInteger(kickNumber) || kickNumber < 3 || (kickNumber - 3) % 4 !== 0) return null;
  return kickNumber % 8 === 3 ? 'left' : 'right';
}

/** +2 when the kick matches the call. A miss of the call is 0, not a failed kick. */
export function calledFootBonus(kickNumber: number, side: Side): number {
  const call = calledFootForKick(kickNumber);
  return call !== null && call === side ? CALLED_FOOT_BONUS : 0;
}

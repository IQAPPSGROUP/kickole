/** Early kick-up celebrations, then every 25th from 75 onward. 50 is in the opening list. */
export const KICK_MILESTONES = [5, 10, 15, 25, 50] as const;

export const MILESTONE_EVERY = 25;

export function isKickMilestone(count: number): boolean {
  if (!Number.isFinite(count) || count <= 0) return false;
  if ((KICK_MILESTONES as readonly number[]).includes(count)) return true;
  return count > 50 && count % MILESTONE_EVERY === 0;
}

/** Milestones that exist at or below `max`. */
export function kickMilestonesUpTo(max: number): number[] {
  if (!Number.isFinite(max) || max < KICK_MILESTONES[0]) return [];
  const list: number[] = [];
  for (const milestone of KICK_MILESTONES) {
    if (milestone <= max) list.push(milestone);
  }
  for (let milestone = 75; milestone <= max; milestone += MILESTONE_EVERY) list.push(milestone);
  return list;
}

/**
 * Highest kick-up milestone crossed by moving from `before` to `after`.
 * Equal counts and downward moves celebrate nothing, so each mark fires once per run.
 */
export function milestoneJustCrossed(before: number, after: number): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return null;
  let found: number | null = null;
  for (const milestone of kickMilestonesUpTo(after)) {
    if (milestone > before && milestone <= after) found = milestone;
  }
  return found;
}

/** Sideline cheer on the first three big marks. Later milestones keep the banner only. */
export function isCheerMilestone(count: number): boolean {
  return count === 5 || count === 10 || count === 25;
}

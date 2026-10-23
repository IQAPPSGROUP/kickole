/** Combo, juggle and perfect-hit cheers fire once as these counts are crossed. */
export const AUDIO_MILESTONES = [10, 25, 50, 100] as const;

export interface AudioProgress {
  streak: number;
  kickUps: number;
  perfects: number;
}

/** Crowd loudness from 0 to 1. A cold run is a murmur; a long streak fills out. */
export function crowdLevel(streak: number): number {
  const s = Math.max(0, streak);
  return Math.min(1, 0.22 + (1 - Math.exp(-s / 16)) * 0.78);
}

function crossed(previous: number, next: number, label: string): string[] {
  const hits: string[] = [];
  for (const mark of AUDIO_MILESTONES) {
    if (previous < mark && next >= mark) hits.push(`${label}:${mark}`);
  }
  return hits;
}

/** Milestone ids newly reached between two progress snapshots. */
export function milestoneHits(previous: AudioProgress, next: AudioProgress): string[] {
  return [
    ...crossed(previous.streak, next.streak, 'streak'),
    ...crossed(previous.kickUps, next.kickUps, 'juggle'),
    ...crossed(previous.perfects, next.perfects, 'perfect'),
  ];
}

/** Bigger moments win when several cheers would land on the same instant. */
export function cheerWeight(id: string): number {
  if (id === 'best') return 3;
  if (id.endsWith(':100') || id.endsWith(':50')) return 2;
  return 1;
}

export function loudestCheer(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return ids.reduce((best, id) => (cheerWeight(id) > cheerWeight(best) ? id : best));
}

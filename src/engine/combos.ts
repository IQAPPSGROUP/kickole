/**
 * Variety combinations — only successful scored engine events advance progress.
 * Attempted / failed / held-repeat / replayed events never award a chain.
 */

export type ComboEvent =
  | 'highFlick'
  | 'header'
  | 'neckCatch'
  | 'neckRelease'
  | 'footStall'
  | 'atwComplete'
  | 'footTouch'
  | 'thighTouch';

export type ComboId = 'flickHeader' | 'headerNeckRelease' | 'stallAtw' | 'altFootThigh';

export interface ComboDefinition {
  id: ComboId;
  label: string;
  /** Ordered successful events required. For altFootThigh, either order of the two steps works. */
  steps: readonly ComboEvent[];
  alternating?: boolean;
}

/** Chains recognised for the variety bonus. */
export const COMBO_DEFINITIONS: readonly ComboDefinition[] = [
  { id: 'flickHeader', label: 'FLICK → HEADER', steps: ['highFlick', 'header'] },
  { id: 'headerNeckRelease', label: 'HEADER → NECK → RELEASE', steps: ['header', 'neckCatch', 'neckRelease'] },
  { id: 'stallAtw', label: 'STALL → ATW', steps: ['footStall', 'atwComplete'] },
  { id: 'altFootThigh', label: 'FOOT ↔ THIGH', steps: ['footTouch', 'thighTouch'], alternating: true },
];

export interface ComboConfig {
  /** Points awarded once when a chain completes. */
  varietyBonus: number;
  /** Max seconds between successive successful steps before progress expires. */
  expirySec: number;
}

export const DEFAULT_COMBO_CONFIG: ComboConfig = {
  varietyBonus: 5,
  expirySec: 3.5,
};

export interface ComboProgress {
  id: ComboId;
  /** Index of the next required step (ordered chains). */
  next: number;
  /** Last accepted event for alternating chains. */
  lastEvent: ComboEvent | null;
  /** Simulation time of the last accepted step. */
  lastTime: number;
}

export interface ComboAward {
  id: ComboId;
  label: string;
  points: number;
}

export interface ComboTrackerState {
  progress: ComboProgress[];
  /** Dedup tokens so the same success cannot be replayed into a chain. */
  seen: Set<string>;
}

export function createComboTracker(): ComboTrackerState {
  return { progress: [], seen: new Set() };
}

export function resetComboTracker(state: ComboTrackerState) {
  state.progress.length = 0;
  state.seen.clear();
}

function expire(state: ComboTrackerState, time: number, expirySec: number) {
  state.progress = state.progress.filter((p) => time - p.lastTime <= expirySec);
}

/**
 * Feed one successful event. Returns awards for any chains completed by this event.
 * `token` must be unique per success (e.g. `${kind}:${time}`).
 */
export function pushComboEvent(
  state: ComboTrackerState,
  event: ComboEvent,
  time: number,
  token: string,
  config: ComboConfig = DEFAULT_COMBO_CONFIG,
): ComboAward[] {
  if (state.seen.has(token)) return [];
  state.seen.add(token);
  expire(state, time, config.expirySec);

  const awards: ComboAward[] = [];

  for (const def of COMBO_DEFINITIONS) {
    let prog = state.progress.find((p) => p.id === def.id);

    if (def.alternating) {
      const a = def.steps[0];
      const b = def.steps[1];
      if (event !== a && event !== b) {
        // Unrelated event — leave alternating progress alone (expiry handles staleness).
        continue;
      }
      if (prog && prog.lastEvent && prog.lastEvent !== event) {
        awards.push({ id: def.id, label: def.label, points: config.varietyBonus });
        state.progress = state.progress.filter((p) => p.id !== def.id);
        // Start fresh with this event as the opener of a potential next chain.
        state.progress.push({ id: def.id, next: 1, lastEvent: event, lastTime: time });
      } else if (!prog || prog.lastEvent === event) {
        // First step, or same touch type again — reset opener to this event (no farm on repeats).
        state.progress = state.progress.filter((p) => p.id !== def.id);
        state.progress.push({ id: def.id, next: 1, lastEvent: event, lastTime: time });
      }
      continue;
    }

    // Ordered chain.
    if (!prog) {
      if (event === def.steps[0]) {
        state.progress.push({ id: def.id, next: 1, lastEvent: event, lastTime: time });
      }
      continue;
    }

    if (event === def.steps[prog.next]) {
      prog.next += 1;
      prog.lastEvent = event;
      prog.lastTime = time;
      if (prog.next >= def.steps.length) {
        awards.push({ id: def.id, label: def.label, points: config.varietyBonus });
        state.progress = state.progress.filter((p) => p.id !== def.id);
      }
    } else if (event === def.steps[0]) {
      prog.next = 1;
      prog.lastEvent = event;
      prog.lastTime = time;
    } else {
      state.progress = state.progress.filter((p) => p.id !== def.id);
    }
  }

  return awards;
}

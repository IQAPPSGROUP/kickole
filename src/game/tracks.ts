/** Gameplay songs. Replace the placeholder titles when the final names are ready. */

export const GAME_TRACKS = [
  { id: 'gameplay-instrumental', title: 'Track 1' },
  { id: 'menu-song', title: 'Track 2' },
  { id: 'game-song-2', title: 'Track 3' },
  { id: 'game-song-3', title: 'Track 4' },
] as const;

export type GameTrackId = (typeof GAME_TRACKS)[number]['id'];

/** Menu music stays on this file. */
export const MENU_TRACK_ID: GameTrackId = 'menu-song';

export const SHUFFLE_SONG = 'shuffle' as const;

export type SongChoice = typeof SHUFFLE_SONG | GameTrackId;

export function trackTitle(id: string): string {
  const track = GAME_TRACKS.find((item) => item.id === id);
  return track ? track.title : 'Track';
}

export function normalizeSongChoice(value: unknown): SongChoice {
  if (value === SHUFFLE_SONG) return SHUFFLE_SONG;
  if (typeof value === 'string' && GAME_TRACKS.some((track) => track.id === value)) return value as GameTrackId;
  return SHUFFLE_SONG;
}

const ALL_TRACK_IDS: readonly GameTrackId[] = GAME_TRACKS.map((track) => track.id);

/** Tracks the player left on. An empty or unknown save keeps every track on. */
export function normalizeEnabledTracks(value: unknown): GameTrackId[] {
  if (!Array.isArray(value)) return [...ALL_TRACK_IDS];
  const enabled = ALL_TRACK_IDS.filter((id) => value.includes(id));
  return enabled.length > 0 ? [...enabled] : [...ALL_TRACK_IDS];
}

/** Turn a track on or off. The last track that is on stays on. */
export function toggleEnabled(enabled: readonly GameTrackId[], id: GameTrackId): GameTrackId[] {
  const current = normalizeEnabledTracks(enabled);
  const on = current.includes(id);
  if (on && current.length <= 1) return current;
  const next = on ? current.filter((item) => item !== id) : [...current, id];
  return ALL_TRACK_IDS.filter((trackId) => next.includes(trackId));
}

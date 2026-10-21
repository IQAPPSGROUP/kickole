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

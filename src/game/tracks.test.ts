import { describe, expect, it } from 'vitest';
import { GAME_TRACKS, normalizeEnabledTracks, normalizeSongChoice, toggleEnabled, trackTitle } from './tracks';

describe('track titles', () => {
  it('keeps a placeholder title for each gameplay file', () => {
    expect(GAME_TRACKS.map((track) => track.title)).toEqual(['Track 1', 'Track 2', 'Track 3', 'Track 4']);
    expect(GAME_TRACKS.map((track) => track.id)).toEqual([
      'gameplay-instrumental',
      'menu-song',
      'game-song-2',
      'game-song-3',
    ]);
    expect(trackTitle('game-song-2')).toBe('Track 3');
    expect(trackTitle('missing')).toBe('Track');
  });

  it('saves shuffle or a known track and treats anything else as shuffle', () => {
    expect(normalizeSongChoice('shuffle')).toBe('shuffle');
    expect(normalizeSongChoice('game-song-3')).toBe('game-song-3');
    expect(normalizeSongChoice('nope')).toBe('shuffle');
    expect(normalizeSongChoice(null)).toBe('shuffle');
  });

  it('keeps every track on until the player turns one off, and never the last one', () => {
    expect(normalizeEnabledTracks(undefined).map((id) => id)).toEqual(GAME_TRACKS.map((track) => track.id));
    expect(normalizeEnabledTracks(['nope', 'game-song-2'])).toEqual(['game-song-2']);
    expect(normalizeEnabledTracks([])).toEqual(GAME_TRACKS.map((track) => track.id));
    const one = toggleEnabled(['menu-song'], 'menu-song');
    expect(one).toEqual(['menu-song']);
    expect(toggleEnabled(GAME_TRACKS.map((track) => track.id), 'game-song-3')).toEqual([
      'gameplay-instrumental',
      'menu-song',
      'game-song-2',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { GAME_TRACKS, normalizeSongChoice, trackTitle } from './tracks';

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
});

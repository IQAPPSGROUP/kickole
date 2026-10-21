import { describe, expect, it } from 'vitest';
import { ADJECTIVES, NOUNS } from './nicknameWords';
import { checkNickname, composeNickname, parseNickname, pickFreePair, romanNumeral, romanValue, suggestNickname } from './nickname';

describe('nickname', () => {
  it('accepts a two-word list tag and a Roman suffix from II', () => {
    expect(checkNickname('Turbo Striker')).toEqual({ ok: true, nickname: 'Turbo Striker' });
    expect(checkNickname('  golden falcon ')).toEqual({ ok: true, nickname: 'Golden Falcon' });
    expect(checkNickname('Turbo Striker II')).toEqual({ ok: true, nickname: 'Turbo Striker II' });
    expect(parseNickname('Neon Cobra XL')).toMatchObject({ adjective: 'Neon', noun: 'Cobra', suffix: 40 });
  });

  it('rejects free typing, a bare word, and the numeral I', () => {
    expect(checkNickname('')).toMatchObject({ ok: false, issue: 'empty' });
    expect(checkNickname('StreetKick42')).toMatchObject({ issue: 'not_in_list' });
    expect(checkNickname('Turbo')).toMatchObject({ issue: 'not_in_list' });
    expect(checkNickname('Turbo Striker I')).toMatchObject({ issue: 'not_in_list' });
    expect(checkNickname('Turbo Striker 2')).toMatchObject({ issue: 'not_in_list' });
    expect(composeNickname('NotAWord', 'Striker')).toBeNull();
  });

  it('writes Roman numerals from 1 through 40 and back', () => {
    expect(romanNumeral(1)).toBe('I');
    expect(romanNumeral(2)).toBe('II');
    expect(romanNumeral(4)).toBe('IV');
    expect(romanNumeral(9)).toBe('IX');
    expect(romanNumeral(40)).toBe('XL');
    expect(romanNumeral(41)).toBe('');
    expect(romanValue('III')).toBe(3);
    expect(romanValue('I')).toBe(1);
    expect(romanValue('IL')).toBeNull();
  });

  it('suggests a pair from the lists', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const name = suggestNickname();
      expect(checkNickname(name).ok).toBe(true);
      seen.add(name);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(suggestNickname(() => 0)).toBe(`${ADJECTIVES[0]} ${NOUNS[0]}`);
  });

  it('prefers a free pair that is not already on screen', () => {
    const current = { adjective: 'Turbo', noun: 'Striker' };
    expect(pickFreePair([
      current,
      { adjective: 'Neon', noun: 'Falcon' },
      { adjective: 'Golden', noun: 'Wolf' },
    ], current, () => 0)).toEqual({ adjective: 'Neon', noun: 'Falcon' });
    expect(pickFreePair([], current)).toBeNull();
    expect(pickFreePair([current], current, () => 0)).toEqual(current);
  });
});

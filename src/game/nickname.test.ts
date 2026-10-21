import { describe, expect, it } from 'vitest';
import { checkNickname, suggestNickname } from './nickname';

describe('nickname', () => {
  it('accepts a street tag', () => {
    expect(checkNickname('StreetKick42')).toEqual({ ok: true, nickname: 'StreetKick42' });
    expect(checkNickname('  alley_tap7 ')).toEqual({ ok: true, nickname: 'alley_tap7' });
  });

  it('rejects length, symbols, email, phone and links', () => {
    expect(checkNickname('')).toMatchObject({ ok: false, issue: 'empty' });
    expect(checkNickname('ab')).toMatchObject({ issue: 'length' });
    expect(checkNickname('a'.repeat(17))).toMatchObject({ issue: 'length' });
    expect(checkNickname('cool name')).toMatchObject({ issue: 'charset' });
    expect(checkNickname('rob@iqapps.com')).toMatchObject({ issue: 'email' });
    expect(checkNickname('gmailkid')).toMatchObject({ issue: 'email' });
    expect(checkNickname('5551234567')).toMatchObject({ issue: 'phone' });
    expect(checkNickname('+44 7700 900123')).toMatchObject({ issue: 'phone' });
    expect(checkNickname('https://kick.test')).toMatchObject({ issue: 'url' });
    expect(checkNickname('www.kick.test')).toMatchObject({ issue: 'url' });
    expect(checkNickname('kickdotcom')).toMatchObject({ issue: 'url' });
  });

  it('rejects profanity, leetspeak, and a plain real name', () => {
    expect(checkNickname('ohshit')).toMatchObject({ issue: 'profanity' });
    expect(checkNickname('sh1t')).toMatchObject({ issue: 'profanity' });
    expect(checkNickname('Maria')).toMatchObject({ issue: 'real_name' });
    expect(checkNickname('JohnSmith')).toMatchObject({ issue: 'real_name' });
    expect(checkNickname('maria_garcia')).toMatchObject({ issue: 'real_name' });
    expect(checkNickname('John42')).toMatchObject({ issue: 'real_name' });
    expect(checkNickname('StreetKick42').ok).toBe(true);
  });

  it('suggests a tag that passes the filter', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const name = suggestNickname();
      expect(checkNickname(name).ok).toBe(true);
      seen.add(name);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(suggestNickname(() => 0)).toBe('StreetKick10');
  });
});

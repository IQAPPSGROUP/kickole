import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeNickname, romanNumeral } from './nickname';
import { ADJECTIVES, NOUNS } from './nicknameWords';

interface BlockedWord {
  word: string;
  mode: 'contains' | 'exact';
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function blockedWords(): BlockedWord[] {
  const sql = readFileSync('supabase/migrations/20261021104400_leaderboard_schema.sql', 'utf8');
  const rows = [...sql.matchAll(/\('([a-z]+)',\s*'(contains|exact)'\)/g)];
  return rows.map((row) => ({
    word: row[1] ?? '',
    mode: row[2] === 'exact' ? 'exact' : 'contains',
  }));
}

function seededWords(): { adjective: string[]; noun: string[] } {
  const sql = readFileSync('supabase/migrations/20261021120000_leaderboard_review_schema.sql', 'utf8');
  const block = sql.split('-- nickname-words:begin')[1]?.split('-- nickname-words:end')[0] ?? '';
  const adjective: string[] = [];
  const noun: string[] = [];
  for (const row of block.matchAll(/\('(adjective|noun)',\s*'([A-Za-z]+)'\)/g)) {
    const kind = row[1];
    const word = row[2] ?? '';
    if (kind === 'adjective') adjective.push(word);
    else noun.push(word);
  }
  return { adjective, noun };
}

function documentedWords(): { adjective: string[]; noun: string[] } {
  const markdown = readFileSync('docs/NICKNAME_WORDS.md', 'utf8');
  const adjectives = markdown.split('## Adjectives')[1]?.split('## Nouns')[0] ?? '';
  const nouns = markdown.split('## Nouns')[1] ?? '';
  const lines = (section: string) => section.split('\n').map((line) => line.trim()).filter((line) => /^[A-Za-z]+$/.test(line));
  return { adjective: lines(adjectives), noun: lines(nouns) };
}

function hits(name: string, blocked: BlockedWord[]): string[] {
  const letters = compact(name);
  const found: string[] = [];
  for (const item of blocked) {
    if (item.mode === 'exact' ? letters === item.word : letters.includes(item.word)) found.push(item.word);
  }
  return found;
}

describe('nickname words', () => {
  const blocked = blockedWords();

  it('keeps about 150 words on each side and matches the SQL seed and the review file', () => {
    expect(ADJECTIVES.length).toBe(150);
    expect(NOUNS.length).toBe(150);
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(NOUNS).size).toBe(NOUNS.length);
    const seeded = seededWords();
    expect(seeded.adjective).toEqual([...ADJECTIVES]);
    expect(seeded.noun).toEqual([...NOUNS]);
    const documented = documentedWords();
    expect(documented.adjective).toEqual([...ADJECTIVES]);
    expect(documented.noun).toEqual([...NOUNS]);
    expect(ADJECTIVES.length * NOUNS.length).toBeGreaterThan(14_000);
    expect(ADJECTIVES).not.toContain('Jumbo');
    expect(ADJECTIVES).not.toContain('Colossal');
    expect(ADJECTIVES).not.toContain('Massive');
    expect(ADJECTIVES).toEqual(expect.arrayContaining(['Jazzy', 'Zippy', 'Snazzy']));
    expect(NOUNS).not.toContain('Roulette');
    expect(NOUNS).toContain('Stepover');
  });

  it('updates a live word list without re-seeding the whole table', () => {
    const sql = readFileSync('supabase/migrations/20261021140000_nickname_words_safeguarding.sql', 'utf8');
    expect(sql).toMatch(/lower\(word\) in \('jumbo', 'colossal', 'massive'\)/);
    expect(sql).toMatch(/lower\(word\) = 'roulette'/);
    expect(sql).toContain("('adjective', 'Jazzy')");
    expect(sql).toContain("('adjective', 'Zippy')");
    expect(sql).toContain("('adjective', 'Snazzy')");
    expect(sql).toContain("('noun', 'Stepover')");
  });

  it('scans every combo, including Roman suffixes through XL, against the blocked words', () => {
    expect(blocked.length).toBeGreaterThan(40);
    const problems: string[] = [];
    for (const adjective of ADJECTIVES) {
      for (const noun of NOUNS) {
        for (let suffix = 1; suffix <= 40; suffix += 1) {
          const nickname = composeNickname(adjective, noun, suffix === 1 ? null : suffix);
          if (!nickname) {
            problems.push(`missing ${adjective} ${noun} ${romanNumeral(suffix)}`);
            continue;
          }
          const found = hits(nickname, blocked);
          if (found.length > 0) problems.push(`${nickname} -> ${found.join(',')}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

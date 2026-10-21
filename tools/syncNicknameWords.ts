/**
 * Writes docs/NICKNAME_WORDS.md and the SQL seed from src/game/nicknameWords.ts.
 * Run: npm run nickname-words
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ADJECTIVES, NOUNS } from '../src/game/nicknameWords';

const markdown = [
  '# Nickname words',
  '',
  'Generated from `src/game/nicknameWords.ts`. The same lists are seeded in `supabase/migrations/20261021120000_leaderboard_review_schema.sql`. Review this file before release.',
  '',
  '## Adjectives',
  '',
  ...ADJECTIVES,
  '',
  '## Nouns',
  '',
  ...NOUNS,
  '',
].join('\n');

writeFileSync('docs/NICKNAME_WORDS.md', markdown);

const sqlPath = 'supabase/migrations/20261021120000_leaderboard_review_schema.sql';
const sql = readFileSync(sqlPath, 'utf8');
const values = [
  ...ADJECTIVES.map((word) => `  ('adjective', '${word}')`),
  ...NOUNS.map((word) => `  ('noun', '${word}')`),
].join(',\n');
const insert = `-- nickname-words:begin
insert into private.nickname_words (kind, word) values
${values}
on conflict do nothing;
-- nickname-words:end`;
const next = sql.replace(/-- nickname-words:begin[\s\S]*?-- nickname-words:end/, insert);
if (next === sql) throw new Error('nickname-words markers were not found');
writeFileSync(sqlPath, next);
console.log(`wrote ${ADJECTIVES.length} adjectives and ${NOUNS.length} nouns`);

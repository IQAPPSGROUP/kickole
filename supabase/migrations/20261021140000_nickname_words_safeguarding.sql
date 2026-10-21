-- Commit only. Apply on the kickole project by hand.
-- Safeguarding: drop the size words and Roulette. The lists stay at 150.
-- Fresh installs already get the new seed in 20261021120000. This updates a database
-- that applied the earlier seed. on conflict keeps it safe to run twice.

delete from private.nickname_words
where (kind = 'adjective' and lower(word) in ('jumbo', 'colossal', 'massive'))
   or (kind = 'noun' and lower(word) = 'roulette');

insert into private.nickname_words (kind, word) values
  ('adjective', 'Jazzy'),
  ('adjective', 'Zippy'),
  ('adjective', 'Snazzy'),
  ('noun', 'Stepover')
on conflict do nothing;

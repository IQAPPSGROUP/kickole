-- Daily Cypher live-ops challenge table (additive to leaderboard schema).
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  challenge_date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  title VARCHAR(64) NOT NULL DEFAULT 'Street Court Electric Cypher',
  description TEXT NOT NULL DEFAULT 'Chain a 30+ combo at 128 BPM Alley Beat',
  required_track_id VARCHAR(48) NOT NULL DEFAULT 'gameplay-instrumental',
  bonus_xp_multiplier NUMERIC(3, 2) NOT NULL DEFAULT 1.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Daily challenges are viewable by all" ON public.daily_challenges;
CREATE POLICY "Daily challenges are viewable by all" ON public.daily_challenges
  FOR SELECT USING (TRUE);

CREATE OR REPLACE FUNCTION public.get_daily_cypher(target_date DATE DEFAULT CURRENT_DATE)
RETURNS public.daily_challenges
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM public.daily_challenges
  WHERE challenge_date <= target_date
  ORDER BY challenge_date DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_cypher(DATE) TO anon, authenticated;

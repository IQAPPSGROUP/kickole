/**
 * Kickole Daily Cypher rotation Edge Function (Supabase pg_cron at 00:00 UTC).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface DailyChallengeConfig {
  title: string;
  description: string;
  required_track_id: string;
  bonus_xp_multiplier: number;
}

const CHALLENGE_POOL: DailyChallengeConfig[] = [
  {
    title: 'Alley Beat Electric Cypher',
    description: 'Chain a 30+ combo at 128 BPM Alley Beat',
    required_track_id: 'gameplay-instrumental',
    bonus_xp_multiplier: 1.5,
  },
  {
    title: 'We Rise Rhythm Lock',
    description: 'Hold 60s airtime with clean foot stalls on We Rise (130 BPM)',
    required_track_id: 'menu-song',
    bonus_xp_multiplier: 1.75,
  },
  {
    title: 'Keep It In The Air Fever',
    description: 'Trigger 5X Fever Mode on Keep It in the Air (136 BPM)',
    required_track_id: 'game-song-2',
    bonus_xp_multiplier: 2.0,
  },
  {
    title: "Don't Let It Drop Endurance",
    description: "Score 1,000+ pts on Don't Let It Drop (140 BPM)",
    required_track_id: 'game-song-3',
    bonus_xp_multiplier: 1.5,
  },
];

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date().toISOString().split('T')[0];
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24,
    );
    const selected = CHALLENGE_POOL[dayOfYear % CHALLENGE_POOL.length];

    const { data, error } = await supabase
      .from('daily_challenges')
      .upsert(
        {
          challenge_date: today,
          title: selected.title,
          description: selected.description,
          required_track_id: selected.required_track_id,
          bonus_xp_multiplier: selected.bonus_xp_multiplier,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'challenge_date' },
      )
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, date: today, challenge: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

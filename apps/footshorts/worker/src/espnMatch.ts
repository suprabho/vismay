/** Manual-only ESPN match detail extraction for imported cup fixtures. Private
 * admin storage only: no writes to fixtures, fixture_events or match facts. */
import { createClient } from '@supabase/supabase-js';
import { ESPN_CUPS } from '@footshorts/shared/espnCups';
import { ESPN_MATCH_DETAIL_TABLE, extractEspnMatch, fetchEspnMatch, loadEspnCupFixture } from '@footshorts/shared/espnMatch';

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  const allowed = args.every(a => a === '--dry-run' || a.startsWith('--event='));
  const ids = args.filter(a => a.startsWith('--event=')).flatMap(a => a.slice('--event='.length).split(',')).filter(Boolean);
  if (!allowed || !ids.length || ids.some(id => !/^\d+$/.test(id))) {
    throw new Error('Usage: cups:espn-match -- --event=<espn event id>[,<id>…] [--dry-run]');
  }
  const dry = args.includes('--dry-run');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  if (!dry) {
    const { error } = await sb.from(ESPN_MATCH_DETAIL_TABLE).select('espn_event_id').limit(1);
    if (error) throw new Error(`Private match-detail storage is unavailable. Apply the admin_espn_cup_match_details migration first: ${error.message}`);
  }
  let failed = false;
  for (const id of ids) {
    try {
      const fixture = await loadEspnCupFixture(sb, id);
      if (!fixture) throw new Error('Not an imported cup fixture. Run cups:espn for its competition first.');
      const cup = ESPN_CUPS.find(c => c.slug === fixture.competition_slug);
      if (!cup) throw new Error(`Unknown competition ${fixture.competition_slug}`);
      const stored = dry ? null : await extractEspnMatch(sb, fixture, cup);
      const detail = stored?.detail ?? (await fetchEspnMatch(cup, id)).detail;
      console.log(JSON.stringify({
        event: id, dryRun: dry, competition: cup.slug,
        match: `${detail.home.name} ${detail.home.score ?? '?'}-${detail.away.score ?? '?'} ${detail.away.name}`,
        status: detail.status.description, timeline: detail.timeline.length, events: detail.events.length,
        teamStats: detail.facts != null, lineups: detail.lineups != null, commentary: detail.commentary.length,
      }));
    } catch (error) {
      failed = true;
      console.error(`[${id}] ${error instanceof Error ? error.message : 'Extraction failed'}`);
    }
  }
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Extraction failed'); process.exitCode = 1; });

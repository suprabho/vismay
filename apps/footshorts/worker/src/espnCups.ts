/** Manual-only private ESPN import. No cron and no writes to public fixtures. */
import { createClient } from '@supabase/supabase-js';
import { ESPN_CUPS, ESPN_CUP_TABLE, currentCupSeason, validCupSeason, fetchEspnCup, importEspnCup } from '@footshorts/shared/espnCups';

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  const allowed = args.every(a => a === '--dry-run' || a.startsWith('--season=') || a.startsWith('--competitions='));
  if (!allowed) throw new Error('Usage: cups:espn -- [--season=2026] [--competitions=fa-cup,efl-cup] [--dry-run]');
  const year = Number(args.find(a => a.startsWith('--season='))?.split('=')[1] ?? currentCupSeason());
  if (!validCupSeason(year)) throw new Error('Invalid season start year');
  const requested = args.find(a => a.startsWith('--competitions='))?.split('=')[1]?.split(',').filter(Boolean);
  if (requested?.some(slug => !ESPN_CUPS.some(c => c.slug === slug))) throw new Error('Unknown competition slug');
  const cups = ESPN_CUPS.filter(c => !requested?.length || requested.includes(c.slug));
  const dry = args.includes('--dry-run');
  const sb = dry ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  if (sb) {
    const { error } = await sb.from(ESPN_CUP_TABLE).select('espn_event_id').limit(1);
    if (error) throw new Error(`Private cup storage is unavailable. Apply the admin_espn_cup_fixtures migration first: ${error.message}`);
  }
  let failed = false;
  for (const cup of cups) {
    try {
      if (sb) console.log(JSON.stringify(await importEspnCup(sb, cup, year)));
      else {
        const rows = await fetchEspnCup(cup, year);
        console.log(JSON.stringify({ competition: cup.slug, season: year, dryRun: true, count: rows.length,
          finished: rows.filter(r => r.status === 'finished').length,
          scheduled: rows.filter(r => r.status === 'scheduled').length }));
      }
    } catch (error) {
      failed = true;
      console.error(`[${cup.slug}] ${error instanceof Error ? error.message : 'Import failed'}`);
    }
  }
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Import failed'); process.exitCode = 1; });

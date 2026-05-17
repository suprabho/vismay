import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { count: locCount } = await s.from('epstein_locations').select('*', { count: 'exact', head: true });
  const { count: peopleCount } = await s.from('epstein_people').select('*', { count: 'exact', head: true });
  const { count: eventCount } = await s.from('epstein_events').select('*', { count: 'exact', head: true });
  const { count: mentionCount } = await s.from('epstein_mentions').select('*', { count: 'exact', head: true });

  console.log(`locations: ${locCount}`);
  console.log(`people: ${peopleCount}`);
  console.log(`events: ${eventCount}`);
  console.log(`mentions: ${mentionCount}`);

  const { data: topLocs } = await s.from('epstein_locations').select('name, mention_count').order('mention_count', { ascending: false }).limit(10);
  console.log('\ntop locations:', topLocs);

  const { data: topPeople } = await s.from('epstein_people').select('name, role, mention_count').order('mention_count', { ascending: false }).limit(10);
  console.log('\ntop people:', topPeople);
}
main();

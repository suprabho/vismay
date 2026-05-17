import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const url = process.argv[2];
  if (url) {
    const { data } = await s
      .from('epstein_documents')
      .select('id, source_url, status, text_source, page_count, raw_text, error')
      .eq('source_url', url)
      .single();
    console.log({
      ...(data as any),
      raw_text_preview: (data as any)?.raw_text?.slice(0, 400),
      raw_text_len: (data as any)?.raw_text?.length,
    });
    return;
  }

  const { data: docs } = await s
    .from('epstein_documents')
    .select('status, text_source, raw_text')
    .limit(10000);

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let big = 0;
  for (const d of docs ?? []) {
    byStatus[(d as any).status] = (byStatus[(d as any).status] ?? 0) + 1;
    const src = (d as any).text_source ?? 'null';
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (((d as any).raw_text?.length ?? 0) >= 500) big++;
  }
  console.log('total:', docs?.length);
  console.log('by status:', byStatus);
  console.log('by text_source:', bySource);
  console.log('real text (>=500 chars):', big);

  const { count: chunksTotal } = await s.from('epstein_chunks').select('*', { count: 'exact', head: true });
  const { count: nerDone } = await s.from('epstein_chunks').select('*', { count: 'exact', head: true }).eq('ner_done', true);
  console.log('chunks total:', chunksTotal, 'ner_done:', nerDone);
}
main();

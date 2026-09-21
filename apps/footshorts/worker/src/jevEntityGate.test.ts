/**
 * Jev entity-tag precision gate — behaviour checks.
 * (run: pnpm --filter @footshorts/worker jev:gate:test)
 *
 * Network-free: @typesafe-ai/sdk takes an injected `fetch`, so every case here
 * drives a stub transport. The point is the gate's contract, which the ingest
 * pipeline leans on hard — it must never return fewer entries than it was
 * given, and it must fail OPEN, because a dropped tag silently removes an
 * article from an entity's story ring.
 */
import { gateEntityTags, clearJevClientCache, type GateArticle } from './jevEntityGate';
import type { ResolvedEntity } from './entityResolver';

let failed = 0;
function ok(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓' : '✗'} ${label}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failed++;
}

const ARTICLE: GateArticle = {
  headline: 'Saka signs new Arsenal deal',
  body:
    'Bukayo Saka has signed a new long-term contract at Arsenal. Sky Sports ' +
    'reported the agreement on Tuesday. Unlike Chelsea last summer, Arsenal ' +
    'moved early to secure their key man.',
  publisher: 'BBC Sport',
};

const ent = (id: string, type: ResolvedEntity['type'], name: string): ResolvedEntity => ({
  id,
  type,
  name,
  sourceName: name,
});

const CANDIDATES = [
  ent('a1', 'team', 'Arsenal'),
  ent('c1', 'team', 'Chelsea'), // comparison context — should be gated out
  ent('p1', 'player', 'Bukayo Saka'),
];

/** A stub transport returning one noul probability per question, in order. */
function stubFetch(probabilities: number[], status = 200) {
  const calls: any[] = [];
  const impl = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push(body);
    if (status !== 200) {
      return new Response(JSON.stringify({ error: 'boom' }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const names = Object.keys(body.questions);
    const answers = Object.fromEntries(
      names.map((n, i) => [n, { type: 'noul', noul: probabilities[i] ?? 1 }]),
    );
    return new Response(
      JSON.stringify({ model: 'jev-latest', answers, usage: { input_tokens: 1, output_tokens: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return { impl: impl as any, calls };
}

async function main() {
  process.env.TYPESAFE_API_KEY = 'test-key';
  delete process.env.JEV_ENTITY_GATE;
  delete process.env.JEV_ENTITY_MIN_CONFIDENCE;

  // 1. Scores map onto the right candidates and the threshold drops the low one.
  clearJevClientCache();
  {
    const { impl, calls } = stubFetch([0.97, 0.08, 0.99]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { fetch: impl });

    ok('one round trip for three candidates', calls.length === 1, `got ${calls.length}`);
    ok('posts all three questions', Object.keys(calls[0].questions).length === 3);
    ok(
      'every question is a noul',
      Object.values(calls[0].questions).every((q: any) => q.type === 'noul'),
    );
    ok(
      'state carries headline, body and publisher',
      calls[0].state.headline === ARTICLE.headline &&
        calls[0].state.article.startsWith('Bukayo Saka has signed') &&
        calls[0].state.publisher === 'BBC Sport',
    );
    ok('returns one verdict per candidate', out.length === 3, `got ${out.length}`);
    ok('order is preserved', out.map((e) => e.id).join(',') === 'a1,c1,p1');
    ok('confidence comes from the noul', out[0]!.confidence === 0.97);
    ok(
      'keeps the subjects, drops the passing mention',
      out[0]!.kept && !out[1]!.kept && out[2]!.kept,
      out.map((e) => `${e.name}=${e.kept}`).join(' '),
    );
  }

  // 2. Threshold is configurable, and it is a >= comparison.
  clearJevClientCache();
  {
    const { impl } = stubFetch([0.6, 0.6, 0.6]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { fetch: impl, minConfidence: 0.6 });
    ok('a score exactly at the threshold is kept', out.every((e) => e.kept));
  }
  clearJevClientCache();
  {
    const { impl } = stubFetch([0.6, 0.6, 0.6]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { fetch: impl, minConfidence: 0.61 });
    ok('a score below the threshold is dropped', out.every((e) => !e.kept));
  }

  // 3. FAIL OPEN — an API error must keep every tag, not lose them.
  clearJevClientCache();
  {
    const { impl } = stubFetch([], 500);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { fetch: impl });
    ok('server error keeps all candidates', out.length === 3 && out.every((e) => e.kept));
    ok('server error falls back to confidence 1.0', out.every((e) => e.confidence === 1.0));
  }

  // 4. Gate off: no key, and the explicit kill switch. Neither may call out.
  clearJevClientCache();
  {
    delete process.env.TYPESAFE_API_KEY;
    const { impl, calls } = stubFetch([0.01, 0.01, 0.01]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { fetch: impl });
    ok('no API key keeps all candidates', out.length === 3 && out.every((e) => e.kept));
    ok('no API key makes no request', calls.length === 0);
    process.env.TYPESAFE_API_KEY = 'test-key';
  }
  clearJevClientCache();
  {
    process.env.JEV_ENTITY_GATE = '0';
    const { impl, calls } = stubFetch([0.01, 0.01, 0.01]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { fetch: impl });
    ok('kill switch keeps all candidates', out.every((e) => e.kept) && calls.length === 0);
    delete process.env.JEV_ENTITY_GATE;
  }

  // 5. Empty candidate list short-circuits — the SDK rejects an empty question set.
  clearJevClientCache();
  {
    const { impl, calls } = stubFetch([]);
    const out = await gateEntityTags(ARTICLE, [], { fetch: impl });
    ok('no candidates means no request', out.length === 0 && calls.length === 0);
  }

  // 6. Chunking: more than 24 candidates must split across requests, and every
  //    candidate must still come back scored.
  clearJevClientCache();
  {
    const many = Array.from({ length: 30 }, (_, i) => ent(`x${i}`, 'team', `Club ${i}`));
    const { impl, calls } = stubFetch(Array(30).fill(0.9));
    const out = await gateEntityTags(ARTICLE, many, { fetch: impl });
    ok('30 candidates split into 2 requests', calls.length === 2, `got ${calls.length}`);
    ok(
      'chunks are 24 + 6',
      Object.keys(calls[0].questions).length === 24 && Object.keys(calls[1].questions).length === 6,
    );
    ok('all 30 come back scored', out.length === 30 && out.every((e) => e.confidence === 0.9));
  }

  // 7. A partial failure loses only the failed chunk's verdicts.
  clearJevClientCache();
  {
    // Fail by chunk, not by attempt: the SDK retries a 503 up to maxRetries
    // times, so failing "the first call" would just succeed on the retry. The
    // full chunk (24 questions) is the one that never comes back.
    const impl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (Object.keys(body.questions).length === 24) {
        return new Response('{}', { status: 503 });
      }
      const answers = Object.fromEntries(
        Object.keys(body.questions).map((n) => [n, { type: 'noul', noul: 0.02 }]),
      );
      return new Response(
        JSON.stringify({ model: 'jev-latest', answers, usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as any;

    const many = Array.from({ length: 30 }, (_, i) => ent(`y${i}`, 'team', `Club ${i}`));
    const out = await gateEntityTags(ARTICLE, many, { fetch: impl });
    const firstChunk = out.slice(0, 24);
    const secondChunk = out.slice(24);
    ok('failed chunk is kept at 1.0', firstChunk.every((e) => e.kept && e.confidence === 1.0));
    ok('healthy chunk is still judged', secondChunk.every((e) => !e.kept && e.confidence === 0.02));
  }

  console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

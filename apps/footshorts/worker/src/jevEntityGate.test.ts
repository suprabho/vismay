/**
 * Jev entity-tag precision gate — behaviour checks.
 * (run: pnpm --filter @footshorts/worker jev:gate:test)
 *
 * Network-free: the gate takes an injected evaluation model, so every case
 * here drives a fake `doEvaluate`. The seam sits at the model rather than at
 * fetch on purpose — these tests assert the gate's behaviour, not the AI
 * Gateway's wire format, so a gateway upgrade can't turn them red.
 *
 * The point is the gate's contract, which the ingest pipeline leans on hard —
 * it must never return fewer entries than it was given, and it must fail OPEN,
 * because a dropped tag silently removes an article from an entity's story
 * ring.
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

type Call = { state: any; questions: Record<string, any> };

/** A fake evaluation model answering one probability per question, in order. */
function stubModel(probabilities: number[]) {
  const calls: Call[] = [];
  const model = {
    async doEvaluate({ state, questions }: any) {
      calls.push({ state, questions });
      const names = Object.keys(questions);
      return {
        answers: Object.fromEntries(
          names.map((n, i) => [n, { type: 'boolean', probability: probabilities[i] ?? 1 }]),
        ),
        warnings: [],
      };
    },
  };
  return { model, calls };
}

/** A model that always throws — the gate should exhaust its retries and then
 *  fail open rather than propagate. */
function failingModel(message = 'gateway exploded') {
  let attempts = 0;
  const model = {
    async doEvaluate() {
      attempts++;
      throw new Error(message);
    },
  };
  return { model, attempts: () => attempts };
}

async function main() {
  process.env.AI_GATEWAY_API_KEY = 'test-key';
  delete process.env.JEV_ENTITY_GATE;
  delete process.env.JEV_ENTITY_MIN_CONFIDENCE;

  // 1. Probabilities map onto the right candidates; the threshold drops the low one.
  clearJevClientCache();
  {
    const { model, calls } = stubModel([0.97, 0.08, 0.99]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { model });

    ok('one round trip for three candidates', calls.length === 1, `got ${calls.length}`);
    ok('sends all three questions', Object.keys(calls[0]!.questions).length === 3);
    ok(
      'every question is a boolean',
      Object.values(calls[0]!.questions).every((q: any) => q.type === 'boolean'),
    );
    ok(
      'each question carries true/false criteria',
      Object.values(calls[0]!.questions).every((q: any) => q.criteria?.true && q.criteria?.false),
    );
    ok(
      'state carries headline, body and publisher',
      calls[0]!.state.headline === ARTICLE.headline &&
        calls[0]!.state.article.startsWith('Bukayo Saka has signed') &&
        calls[0]!.state.publisher === 'BBC Sport',
    );
    ok('returns one verdict per candidate', out.length === 3, `got ${out.length}`);
    ok('order is preserved', out.map((e) => e.id).join(',') === 'a1,c1,p1');
    ok('confidence comes from the probability', out[0]!.confidence === 0.97);
    ok(
      'keeps the subjects, drops the passing mention',
      out[0]!.kept && !out[1]!.kept && out[2]!.kept,
      out.map((e) => `${e.name}=${e.kept}`).join(' '),
    );
  }

  // 2. Threshold is configurable, and it is a >= comparison.
  clearJevClientCache();
  {
    const { model } = stubModel([0.6, 0.6, 0.6]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { model, minConfidence: 0.6 });
    ok('a score exactly at the threshold is kept', out.every((e) => e.kept));
  }
  clearJevClientCache();
  {
    const { model } = stubModel([0.6, 0.6, 0.6]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { model, minConfidence: 0.61 });
    ok('a score below the threshold is dropped', out.every((e) => !e.kept));
  }

  // 3. FAIL OPEN — an erroring model must keep every tag, not lose them.
  clearJevClientCache();
  {
    const { model, attempts } = failingModel();
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { model });
    ok('model error keeps all candidates', out.length === 3 && out.every((e) => e.kept));
    ok('model error falls back to confidence 1.0', out.every((e) => e.confidence === 1.0));
    ok('the call was retried before giving up', attempts() === 3, `${attempts()} attempts`);
  }

  // 4. A malformed answer is treated as unscored, not as a zero.
  clearJevClientCache();
  {
    const model = {
      async doEvaluate({ questions }: any) {
        const names = Object.keys(questions);
        return {
          answers: Object.fromEntries([
            [names[0]!, { type: 'boolean', probability: 0.02 }],
            [names[1]!, { type: 'choice', choice: 'nonsense' }], // wrong shape
            // names[2] omitted entirely
          ]),
          warnings: [],
        };
      },
    };
    const out = await gateEntityTags(ARTICLE, CANDIDATES, { model });
    ok('a well-formed low answer is still dropped', !out[0]!.kept && out[0]!.confidence === 0.02);
    ok('a wrong-typed answer keeps the tag at 1.0', out[1]!.kept && out[1]!.confidence === 1.0);
    ok('a missing answer keeps the tag at 1.0', out[2]!.kept && out[2]!.confidence === 1.0);
  }

  // 5. Gate off: no credentials, and the explicit kill switch. Neither may call out.
  //    (No injected model here — that would bypass the enabled check by design.)
  clearJevClientCache();
  {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    const out = await gateEntityTags(ARTICLE, CANDIDATES);
    ok('no gateway key keeps all candidates', out.length === 3 && out.every((e) => e.kept));
    process.env.AI_GATEWAY_API_KEY = 'test-key';
  }
  clearJevClientCache();
  {
    process.env.JEV_ENTITY_GATE = '0';
    const { model, calls } = stubModel([0.01, 0.01, 0.01]);
    const out = await gateEntityTags(ARTICLE, CANDIDATES);
    ok('kill switch keeps all candidates', out.every((e) => e.kept) && calls.length === 0);
    void model;
    delete process.env.JEV_ENTITY_GATE;
  }

  // 6. Empty candidate list short-circuits.
  clearJevClientCache();
  {
    const { model, calls } = stubModel([]);
    const out = await gateEntityTags(ARTICLE, [], { model });
    ok('no candidates means no request', out.length === 0 && calls.length === 0);
  }

  // 7. Chunking: more than 24 candidates split across requests, and every
  //    candidate still comes back scored.
  clearJevClientCache();
  {
    const many = Array.from({ length: 30 }, (_, i) => ent(`x${i}`, 'team', `Club ${i}`));
    const { model, calls } = stubModel(Array(30).fill(0.9));
    const out = await gateEntityTags(ARTICLE, many, { model });
    ok('30 candidates split into 2 requests', calls.length === 2, `got ${calls.length}`);
    ok(
      'chunks are 24 + 6',
      Object.keys(calls[0]!.questions).length === 24 &&
        Object.keys(calls[1]!.questions).length === 6,
    );
    ok('all 30 come back scored', out.length === 30 && out.every((e) => e.confidence === 0.9));
  }

  // 8. A partial failure loses only the failed chunk's verdicts. Fail by chunk
  //    size, not by attempt count — the gate retries, so failing "the first
  //    call" would just succeed on the retry.
  clearJevClientCache();
  {
    const model = {
      async doEvaluate({ questions }: any) {
        const names = Object.keys(questions);
        if (names.length === 24) throw new Error('503 from gateway');
        return {
          answers: Object.fromEntries(
            names.map((n) => [n, { type: 'boolean', probability: 0.02 }]),
          ),
          warnings: [],
        };
      },
    };
    const many = Array.from({ length: 30 }, (_, i) => ent(`y${i}`, 'team', `Club ${i}`));
    const out = await gateEntityTags(ARTICLE, many, { model });
    ok(
      'failed chunk is kept at 1.0',
      out.slice(0, 24).every((e) => e.kept && e.confidence === 1.0),
    );
    ok(
      'healthy chunk is still judged',
      out.slice(24).every((e) => !e.kept && e.confidence === 0.02),
    );
  }

  console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

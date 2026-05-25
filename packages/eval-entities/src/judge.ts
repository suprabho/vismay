/**
 * LLM-as-judge for entity tagging.
 *
 * Sends each article + its currently-tagged entities to a stronger Gemini
 * model and asks "of these tags, which are correct, which are spurious, and
 * what's missing?". Returns a strict-JSON verdict per article.
 *
 * Defaults to gemini-3.1-pro (a step up from the Flash/Flash-Lite extractors
 * used by the workers). Override via RunOpts.judgeModel.
 *
 * Methodological note: same model family as the extractor, so this isn't a
 * fully independent judge. Good enough for catching obvious regressions and
 * trends; layer a hand-labeled golden set on top later if you want CI gating.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { EvalArticle, JudgeVerdict } from './types';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error('GEMINI_API_KEY required for eval-entities judge');
}

const client = new GoogleGenAI({ apiKey: API_KEY });

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    correct: {
      type: Type.ARRAY,
      description: 'Tagged entities the article IS about. Echo the name and type verbatim from the input list.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          name: { type: Type.STRING },
        },
        required: ['type', 'name'],
      },
    },
    spurious: {
      type: Type.ARRAY,
      description:
        'Tagged entities that should NOT be on this article: hallucinations, weak passing mentions, wrong canonical mapping (e.g. "Mercedes" tagged when the article is about Mercedes-Benz the car brand), or the wrong type. Echo the name/type verbatim and give a short reason.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          name: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['type', 'name', 'reason'],
      },
    },
    missing: {
      type: Type.ARRAY,
      description:
        'Entities the article IS clearly about but that were NOT tagged. Only include obvious omissions — primary subjects, not every name dropped in passing. Use the same type vocabulary the article uses for its tags.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          name: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['type', 'name', 'reason'],
      },
    },
    notes: {
      type: Type.STRING,
      description: 'One sentence (max 25 words) explaining the overall verdict.',
    },
  },
  required: ['correct', 'spurious', 'missing', 'notes'],
};

function buildSystemPrompt(appName: string, entityTypes: readonly string[]): string {
  return `You are grading entity-tagging quality for a ${appName} news feed.

Each article has been auto-tagged with entities of type: ${entityTypes.join(', ')}.

Your job: given the article text and the list of currently-tagged entities, decide:
  - CORRECT: tags that are genuinely about-subject (a primary or substantive secondary topic of the article).
  - SPURIOUS: tags that should not be there. Common failure modes:
      * Passing mention only — entity is named but the article isn't about them.
      * Wrong canonical mapping — e.g. "Mercedes" the F1 team tagged when the article is about Mercedes-Benz cars.
      * Wrong type — e.g. a circuit name tagged as a team.
      * Hallucination — entity isn't in the text at all.
  - MISSING: entities the article IS clearly about but that weren't tagged. Be strict: only flag primary or substantive secondary subjects, not every named entity in the body. Use the same type vocabulary above.

Rules:
- Echo names verbatim from the input list when classifying correct/spurious. Do not paraphrase or normalise.
- Use the same type strings (${entityTypes.join(', ')}) for the "missing" entries.
- Empty arrays are fine: an article correctly tagged with nothing missing should produce { correct: [...all of them...], spurious: [], missing: [], notes: "..." }.
- If the body says nothing meaningful (truncated RSS, paywall), tag everything as correct that's plausibly mentioned in the headline and note the limitation.`;
}

export type Judge = (article: EvalArticle) => Promise<JudgeVerdict | { error: string }>;

const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse a Gemini 429 error message and extract its retryDelay (seconds).
 * The SDK throws the raw response body as the message, so we look for either
 * the `retryDelay` field in the structured error, or a "Please retry in Ns"
 * substring. Returns null when the error isn't a 429.
 */
function parseRetryDelaySeconds(message: string): number | null {
  if (!message.includes('429') && !message.includes('RESOURCE_EXHAUSTED')) return null;
  try {
    // SDK sometimes returns the raw JSON body as message; sometimes nested.
    const jsonStart = message.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(message.slice(jsonStart));
      const details = parsed?.error?.details;
      if (Array.isArray(details)) {
        for (const d of details) {
          const dly: string | undefined = d?.retryDelay;
          if (typeof dly === 'string') {
            const m = dly.match(/^([\d.]+)s$/);
            if (m && m[1]) return Math.ceil(parseFloat(m[1]));
          }
        }
      }
    }
  } catch {
    /* fall through to regex */
  }
  const m = message.match(/retry in ([\d.]+)s/i);
  if (m && m[1]) return Math.ceil(parseFloat(m[1]));
  return 30; // sensible default for a 429 we couldn't parse
}

export function createJudge(opts: {
  model: string;
  appName: string;
  entityTypes: readonly string[];
}): Judge {
  const systemInstruction = buildSystemPrompt(opts.appName, opts.entityTypes);

  return async function judge(article) {
    const taggedList =
      article.taggedEntities.length === 0
        ? '(none)'
        : article.taggedEntities.map((e) => `- ${e.name} [${e.type}]`).join('\n');

    const prompt = `Publisher: ${article.publisher}
Headline: ${article.headline}

Body:
${article.body}

Currently-tagged entities:
${taggedList}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await client.models.generateContent({
          model: opts.model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            responseSchema: responseSchema as any,
            temperature: 0.1,
          },
        });
        const text = response.text ?? '';
        if (!text) return { error: 'empty response from judge' };
        const parsed = JSON.parse(text) as JudgeVerdict;
        if (
          !Array.isArray(parsed.correct) ||
          !Array.isArray(parsed.spurious) ||
          !Array.isArray(parsed.missing)
        ) {
          return { error: `malformed judge output: ${text.slice(0, 200)}` };
        }
        return parsed;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const retrySec = parseRetryDelaySeconds(msg);
        if (retrySec !== null && attempt < MAX_RETRIES) {
          // 429: server told us how long to wait. Add a small jitter so all
          // parallel workers don't fire again at the exact same instant.
          const jitter = Math.random() * 2;
          const waitMs = Math.min(60, retrySec + jitter) * 1000;
          await sleep(waitMs);
          continue;
        }
        return { error: msg };
      }
    }
    return { error: 'exceeded retry budget' };
  };
}

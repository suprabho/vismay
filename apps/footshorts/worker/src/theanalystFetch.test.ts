import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { BotChallengeError, blockedBy, blockedHostErrors, fetchHtml, gotoChecked, isChallengeTitle } from './theanalyst/fetch';

/** A stand-in Playwright page: `title` is what the document says after load. */
function fakePage(title: string, headers: Record<string, string> = {}) {
  const calls = { goto: 0 };
  const page = {
    goto: async () => {
      calls.goto++;
      return { status: () => (headers['cf-mitigated'] ? 403 : 200), headers: () => headers };
    },
    title: async () => title,
    // The grace period: a challenge that never clears times out.
    waitForFunction: async () => {
      throw new Error('timeout');
    },
  } as unknown as Page;
  return { page, calls };
}

test('isChallengeTitle knows Cloudflare interstitials', () => {
  assert.ok(isChallengeTitle('Just a moment...'));
  assert.ok(isChallengeTitle('Attention Required! | Cloudflare'));
  assert.ok(!isChallengeTitle('LaLiga Fixtures | Opta Analyst'));
});

test('a normal page passes and blocks nothing', async () => {
  const { page, calls } = fakePage('Data Hub - Stats Hub');
  await gotoChecked(page, 'https://dataviz.theanalyst.com/opta-football-match-centre/?matchId=1');
  assert.equal(calls.goto, 1);
  assert.equal(blockedBy('https://dataviz.theanalyst.com/'), null);
});

test('the first challenge blocks its host; the next request fails without being made', async () => {
  const first = fakePage('Just a moment...', { 'cf-mitigated': 'challenge' });
  await assert.rejects(gotoChecked(first.page, 'https://theanalyst.com/competition/la-liga/fixtures'), (e: unknown) => {
    assert.ok(e instanceof BotChallengeError);
    assert.equal(e.host, 'theanalyst.com');
    assert.match(e.evidence, /HTTP 403, cf-mitigated: challenge, page title "Just a moment\.\.\."/);
    return true;
  });

  const second = fakePage('LaLiga Fixtures');
  await assert.rejects(gotoChecked(second.page, 'https://theanalyst.com/competition/premier-league/fixtures'), BotChallengeError);
  assert.equal(second.calls.goto, 0, 'a blocked host gets no further requests');

  // Plain fetch shares the same per-host block.
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched++;
    return new Response('', { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  try {
    await assert.rejects(fetchHtml('https://theanalyst.com/competition/premier-league/articles'), BotChallengeError);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = realFetch;
  }

  // Other hosts are unaffected: the match-centre widget is not behind Cloudflare.
  assert.equal(blockedBy('https://dataviz.theanalyst.com/'), null);
  assert.deepEqual(blockedHostErrors().map((e) => e.host), ['theanalyst.com']);
});

test('plain fetch: a 403 with cf-mitigated: challenge blocks the host', async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched++;
    return new Response('<title>Just a moment...</title>', {
      status: 403,
      headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(fetchHtml('https://news.example.test/articles'), (e: unknown) => {
      assert.ok(e instanceof BotChallengeError);
      assert.equal(e.evidence, 'HTTP 403, cf-mitigated: challenge');
      return true;
    });
    await assert.rejects(fetchHtml('https://news.example.test/other'), BotChallengeError);
    assert.equal(fetched, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

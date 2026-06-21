/**
 * markitdown extractor checks (run: npx tsx src/__fixtures__/markitdown.test.ts)
 *
 *   1. routing   — isMarkitdownExt selects PDF/Office/EPub, not HTML/CSV/text
 *                  (the formats the synchronous TS extractor keeps).
 *   2. probe     — isMarkitdownAvailable resolves to a boolean and is cached.
 *   3. round-trip (only when the `markitdown` CLI is installed) — an HTML buffer
 *      converts to non-empty Markdown with a derived title.
 */
import assert from 'node:assert'
import {
  isMarkitdownExt,
  isMarkitdownAvailable,
  extractWithMarkitdown,
} from '../ingest/markitdown'

async function main(): Promise<void> {
  // 1. routing
  for (const ok of ['a.pdf', 'a.PDF', 'b.docx', 'c.pptx', 'd.xlsx', 'e.epub']) {
    assert.equal(isMarkitdownExt(ok), true, `expected ${ok} to route to markitdown`)
  }
  for (const no of ['a.html', 'b.csv', 'c.json', 'd.txt', 'e.md', 'f']) {
    assert.equal(isMarkitdownExt(no), false, `expected ${no} to stay on the TS path`)
  }

  // 2. probe — boolean + cached (same promise reference on a second call)
  const probe = isMarkitdownAvailable()
  assert.equal(probe, isMarkitdownAvailable(), 'availability probe should be cached')
  const available = await probe
  assert.equal(typeof available, 'boolean')

  // 3. round-trip — only meaningful where the CLI is installed (CI worker / a
  //    dev box with `pip install markitdown`). Skipped cleanly otherwise.
  if (available) {
    const html = Buffer.from('<h1>Quarterly Report</h1><p>Revenue rose 12%.</p>', 'utf8')
    const ex = await extractWithMarkitdown(html, { label: 'report.html' })
    assert.ok(ex.body.length > 0, 'expected non-empty markdown')
    assert.ok(/Quarterly Report/i.test(ex.title), `unexpected title: ${ex.title}`)
    console.log('round-trip ok:', JSON.stringify(ex.title))
  } else {
    console.log('round-trip skipped: markitdown CLI not installed')
  }

  console.log('markitdown.test.ts: all assertions passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

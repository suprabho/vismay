import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText } from './ingestNews'

test('feed titles decode numeric and named entities', () => {
  assert.equal(
    htmlToText("Trail Blazers owner Tom Dundon: &#39;My intention here is clear&#39;"),
    "Trail Blazers owner Tom Dundon: 'My intention here is clear'",
  )
  assert.equal(htmlToText('LeBron James&#8217; helicopter trips'), 'LeBron James’ helicopter trips')
  assert.equal(htmlToText('Nets &amp; Knicks\n\t rivalry'), 'Nets & Knicks rivalry')
})

/** Checks for the editorial SEO head, JSON-LD, sitemap and RSS.
 *  (run: npx tsx src/seo.test.ts) */
import assert from 'node:assert/strict'
import {
  clampHeadline,
  htmlStoriesRss,
  htmlStoryCanonicalUrl,
  htmlStoryJsonLd,
  htmlStorySitemapEntries,
  injectHtmlStorySeo,
} from './seo'
import type { HtmlStorySeoInput } from './seo'

const story: HtmlStorySeoInput = {
  slug: 'verstappen-monza-tyre-strategy',
  app: 'vizf1',
  title: "Verstappen's Monza tyre gamble, lap by lap",
  description: 'One stop, 38 laps on hards: how the call won by 4.1 seconds.',
  ogImageUrl: 'https://img.example.com/monza.jpg',
  publishedAt: '2026-09-07T18:00:00Z',
  updatedAt: '2026-09-08T09:00:00Z',
  createdAt: '2026-09-07T12:00:00Z',
}

// The canonical is always the production origin.
assert.equal(htmlStoryCanonicalUrl('vizf1', story.slug), 'https://www.vizf1.com/s/verstappen-monza-tyre-strategy')
assert.equal(htmlStoryCanonicalUrl('viznba', 'x'), 'https://nba.vizmaya.fyi/s/x')

// A bare document gets the full set, at the end of <head>.
const bare = `<!doctype html><html lang="en"><head><title>T</title></head><body><h1>T</h1></body></html>`
const out = injectHtmlStorySeo(bare, story)
const head = out.slice(0, out.indexOf('</head>'))
assert.ok(head.includes('<link rel="canonical" href="https://www.vizf1.com/s/verstappen-monza-tyre-strategy">'))
assert.ok(head.includes('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'))
assert.ok(head.includes('<meta property="og:type" content="article">'))
assert.ok(head.includes('<meta property="og:site_name" content="VizF1">'))
assert.ok(head.includes('<meta property="article:published_time" content="2026-09-07T18:00:00Z">'))
assert.ok(head.includes('<meta name="twitter:card" content="summary_large_image">'))
assert.ok(head.includes('href="https://www.vizf1.com/editorial/rss.xml"'))
assert.ok(head.includes('<script type="application/ld+json">'))
// Apostrophes are fine in attributes; quotes and angle brackets are escaped.
assert.ok(head.includes(`<meta property="og:title" content="Verstappen's Monza tyre gamble, lap by lap">`))
// The body is untouched.
assert.ok(out.endsWith('</head><body><h1>T</h1></body></html>'))

// What the author declared is kept, never duplicated.
const authored = `<!doctype html><html><head>
<meta name="description" content="Mine">
<meta property="og:image" content="https://a.example/x.png">
<link rel="canonical" href="https://www.vizf1.com/s/verstappen-monza-tyre-strategy">
<script type="application/ld+json">{"@type":"Article"}</script>
</head><body></body></html>`
const kept = injectHtmlStorySeo(authored, story)
assert.equal(kept.match(/name="description"/g)?.length, 1)
assert.equal(kept.match(/property="og:image"/g)?.length, 1)
assert.equal(kept.match(/rel="canonical"/g)?.length, 1)
assert.equal(kept.match(/application\/ld\+json/g)?.length, 1)
assert.ok(kept.includes('<meta name="description" content="Mine">'))

// A tag mentioned only inside a script doesn't count as declared.
const scripted = `<html><head><script>var t = '<meta name="description" content="x">'</script></head><body></body></html>`
assert.ok(injectHtmlStorySeo(scripted, story).includes(`<meta name="description" content="${story.description}">`))

// The embed is noindexed but still points at the real URL.
const embed = injectHtmlStorySeo(bare, story, { embed: true })
assert.ok(embed.includes('<meta name="robots" content="noindex, follow">'))
assert.ok(embed.includes('rel="canonical"'))

// Fragments without <head> still get the tags up front.
assert.ok(injectHtmlStorySeo('<p>hi</p>', story).startsWith('<link rel="canonical"'))

// JSON-LD: a NewsArticle on the publisher's @id, plus breadcrumbs; no script breakout.
const ld = htmlStoryJsonLd({ ...story, title: 'A </script><b>x' }) as { '@graph': Record<string, any>[] }
const [article, crumbs] = ld['@graph']
assert.equal(article!['@type'], 'NewsArticle')
assert.equal(article!.publisher['@id'], 'https://www.vizf1.com/#organization')
assert.equal(article!.datePublished, '2026-09-07T18:00:00Z')
assert.equal(article!.dateModified, '2026-09-08T09:00:00Z')
assert.equal(crumbs!['@type'], 'BreadcrumbList')
assert.equal(crumbs!.itemListElement[1].item, 'https://www.vizf1.com/editorial')
const breakout = injectHtmlStorySeo(bare, { ...story, title: 'A </script><b>x' })
assert.equal(breakout.match(/<\/script>/g)?.length, 1)

// Footshorts breadcrumbs point at the public archive, not the client-side tab.
const fs = htmlStoryJsonLd({ ...story, app: 'footshorts' }) as { '@graph': Record<string, any>[] }
assert.equal(fs['@graph'][1]!.itemListElement[1].item, 'https://footshorts.com/editorial')
// vizmaya.fyi has no editorial RSS route, so no alternate link.
assert.ok(!injectHtmlStorySeo(bare, { ...story, app: 'vizmaya-fyi' }).includes('application/rss+xml'))

// Headlines are cut on a word.
assert.equal(clampHeadline('short'), 'short')
const long = clampHeadline('word '.repeat(40))
assert.ok(long.length <= 110 && !long.endsWith(' '))

// Sitemap rows.
const [row] = htmlStorySitemapEntries([story])
assert.equal(row!.url, 'https://www.vizf1.com/s/verstappen-monza-tyre-strategy')
assert.equal(row!.lastModified!.toISOString(), '2026-09-08T09:00:00.000Z')
assert.deepEqual(row!.images, ['https://img.example.com/monza.jpg'])

// RSS: escaped, permalinked, self-linked.
const rss = htmlStoriesRss('vizf1', [{ ...story, title: 'Fast & loose <laps>' }])
assert.ok(rss.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
assert.ok(rss.includes('<title>Fast &amp; loose &lt;laps&gt;</title>'))
assert.ok(rss.includes('<guid isPermaLink="true">https://www.vizf1.com/s/verstappen-monza-tyre-strategy</guid>'))
assert.ok(rss.includes('<atom:link href="https://www.vizf1.com/editorial/rss.xml" rel="self"'))
assert.ok(rss.includes('<pubDate>Mon, 07 Sep 2026 18:00:00 GMT</pubDate>'))

console.log('seo ok')

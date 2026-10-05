/**
 * The brief an agent reads before writing an HTML story. Admin's HTML stories
 * tab has a "Copy agent brief" button that hands this to any chat agent; the
 * MCP server returns it from `get_html_story_brief`.
 *
 * Keep it about outcomes and constraints, not a component catalogue: the whole
 * point of this pipeline is that the agent designs the page itself.
 */

import { MAX_HTML_BYTES } from './meta'

export interface BriefOptions {
  /** e.g. https://vizmaya.fyi */
  siteUrl: string
}

export function htmlStoryBrief({ siteUrl }: BriefOptions): string {
  const site = siteUrl.replace(/\/$/, '')
  return `# Writing a vizmaya HTML story

You are writing one finished data story for vizmaya.fyi as a single,
self-contained HTML file. It is hosted exactly as you write it at
${site}/s/<slug>. Nothing post-processes it, so what you write is what readers
get. You own the design, the charts, and the words.

## The hosting contract (must)

1. One complete document: \`<!doctype html>\`, \`<html lang="en">\`, \`<head>\`, \`<body>\`.
2. In \`<head>\`:
   - \`<meta charset="utf-8">\`
   - \`<meta name="viewport" content="width=device-width, initial-scale=1">\`
   - \`<title>\`: the story headline. It becomes the story's title.
   - \`<meta name="description">\`: a one-sentence summary.
   - \`og:title\`, \`og:description\`, \`og:image\` (absolute https URL, 1200×630) and \`twitter:card\` = \`summary_large_image\`.
3. Every asset is inline or an absolute \`https://\` URL. There is no folder next
   to the page, so \`./chart.js\` or \`images/map.png\` will 404.
4. Load libraries from a CDN (jsdelivr, unpkg, cdnjs) with pinned versions.
5. The page runs in a sandbox: no cookies, and \`localStorage\`/\`sessionStorage\`
   throw. Wrap any storage use in try/catch, or don't use it.
6. Stay under ${MAX_HTML_BYTES / 1024 / 1024} MB. Don't base64 big photos; link them.
7. It must work from 360px to 1600px wide with no horizontal scroll, and charts
   must redraw on resize.
8. Respect \`prefers-reduced-motion\`. Content must never be hidden if a script fails.

## Design direction

Aim for the bar of the best newsroom visual stories (The Pudding, FT, Reuters
Graphics, NYT Upshot): editorial, calm, confident. One idea per screen.

House style (use it unless the story clearly wants its own look):
- Background \`#0a0e14\`, surface \`#111820\`, text \`#e0ddd5\`, muted \`#5a6a70\`, hairlines \`#1a2830\`.
- Accent \`#D85A30\` (the one colour that means "look here"), secondary \`#534AB7\`, teal \`#1D9E75\`.
- Type: Fraunces for headlines and big numbers, Inter for body, JetBrains Mono for
  labels, axes and data (all on Google Fonts). Body 18–20px, line-height 1.6,
  measure 60–70 characters.
- Lots of space. Big standalone numbers. Short paragraphs. Pull quotes sparingly.

## Icons and flags

Use both. They make a page scannable, but they support the words and never replace them.

- **Icons: Phosphor.** Load
  \`https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css\`
  (swap \`regular\` for \`fill\` or \`duotone\` if you want those weights too), then
  write \`<i class="ph ph-trend-up" aria-hidden="true"></i>\`. Use them for section
  markers, stat cards, callouts and key-takeaway lists. Stick to one weight, and
  size them to the text they sit next to. Use no other icon set and no emoji.
- **Flags: flag-icons.** Whenever a country appears (a table row, a chart label,
  a stat card, a map callout), show its flag next to its name. Load
  \`https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/css/flag-icons.min.css\` and write
  \`<span class="fi fi-in"></span>\` (ISO 3166-1 alpha-2, lowercase; add \`fis\`
  for a square flag). Inside SVG charts, use
  \`<image href="https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/in.svg">\`
  (or \`flags/1x1/\` for round markers). Never use emoji flags: Windows shows them
  as two letters. A flag always sits beside the country name, never instead of it.

## Motion and scroll animation

Animate on scroll. The page should feel alive as the reader moves through it:
- **Reveal**: text blocks, stat cards and charts fade in and rise 16–24px as they
  enter the viewport (400–700ms, ease-out, once only). Stagger siblings by ~80ms.
- **Charts build when seen**: bars grow from zero, lines draw from left to right,
  points and labels follow. Start this when the chart scrolls into view, not on
  page load.
- **Big numbers count up** to their value when they appear.
- **Scrollytelling** when the data has a sequence: a sticky graphic with text
  steps that change it. Mark each step \`<section data-step>\`.

How to build it:
- IntersectionObserver is enough; GSAP ScrollTrigger is fine for richer sequences.
  Animate only \`transform\` and \`opacity\`.
- Content is visible by default. Hide elements for their reveal only after your
  script runs (e.g. it adds \`class="js"\` to \`<html>\` and your CSS keys off
  \`.js\`), so a script failure never leaves a blank page.
- Under \`prefers-reduced-motion: reduce\`, show everything in its final state
  with no movement.
- Keep it calm: motion should guide the eye to the point, not decorate.

## Charts

- D3 v7 or Observable Plot for bespoke charts; ECharts is fine for standard
  ones. For maps, use D3-geo with world-atlas/us-atlas TopoJSON, or MapLibre GL
  with free tiles. Don't use Mapbox: it needs a token.
- Each chart makes one point, and its title states that point ("Exports doubled
  after 2019", not "Exports 2015–2024").
- Label lines and bars directly instead of using legends. Use at most 5–6 colours,
  grey for context and the accent for the subject.
- Bars start at zero. Show units. Use tabular numerals. Round sensibly.
- Put a source line under every chart, linked to the original.
- On phones, labels must not overlap or clip: shorten them, rotate nothing, and
  drop to fewer ticks. Test this.

## Content

- Every number has a source. End with a "Sources & method" section of links.
- Byline "vizmaya desk" plus the date.
- Write plainly. No hype. Lead with the finding.

## Before you post: check your own work

If you can run a browser, render the page at 375×812 and 1440×900 and look at
the screenshots. Then fix:
- text or labels overflowing, overlapping, or cut off
- anything wider than the viewport
- console errors, and charts that are empty or blank
- low-contrast text

If you can't render it, re-read your chart code for these specific failures.

## Posting

Pick the first one you can do:
- **MCP tool**: call \`publish_html_story\` with \`slug\` and \`html\`.
- **HTTP**: \`POST ${site}/api/html-stories?slug=<slug>\` with the HTML as the
  body (\`Content-Type: text/html\`) and \`Authorization: Bearer $HTML_STORIES_TOKEN\`.
  Add \`&publish=1\` to make it public right away; otherwise it saves as a draft.
  The response lists \`warnings\`. Fix them and post again to the same slug.
- **Otherwise**: give the user the complete HTML file. They will paste it into
  the admin's HTML stories tab.

Slugs are lowercase words joined by hyphens, e.g. \`india-solar-boom-2026\`.
Posting to an existing slug replaces it; older versions stay restorable.
`
}

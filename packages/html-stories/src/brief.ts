/**
 * The brief an agent reads before writing an HTML story. Admin's HTML stories
 * tabs have a "Copy agent brief" button that hands this to any chat agent; the
 * MCP server returns it from `get_html_story_brief`; each site serves it at
 * /api/html-stories/brief.
 *
 * One brief per app (./apps): the hosting contract and the craft rules are the
 * same everywhere, the house style, the chrome and the posting targets are the
 * site's own, and footshorts briefs can carry a match context (facts,
 * timeline, insights, commentary, schedules and tables for the matches the
 * story is about — built server-side, see ./footshortsBrief).
 *
 * A vizmaya brief can also carry a randomizer spin (@vismay/randomizer): the
 * topic the Desk, Atlas or Epics randomizer drew, with its research protocol,
 * deliverables, output format, reel script rules and quality checklist. The
 * spin's sections live in the randomizer package; this file only decides
 * where they go. Without a spin the brief is unchanged.
 *
 * Maps are Mapbox scrollytelling when the deployment has a public Mapbox token
 * (NEXT_PUBLIC_MAPBOX_TOKEN, the one the sites' own map pages use): the brief
 * hands the agent that token and the sticky-map pattern. Without one the brief
 * falls back to MapLibre and D3-geo.
 *
 * Keep it about outcomes and constraints, not a component catalogue: the whole
 * point of this pipeline is that the agent designs the page itself.
 */

import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import {
  assignmentSection,
  chartRules,
  checklistSection,
  contentSection as spinContentSection,
  deliverablesSection,
  formatSection,
  postingLines,
  reelScriptSection,
  researchAppendix,
  researchProtocolSection,
  type BriefSpin,
} from '@vismay/randomizer/spinBrief'
import { DEFAULT_HTML_STORY_APP, HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import { MAX_HTML_BYTES, THEME_META_NAME, themeMetaContent, type ThemeColors } from './meta'
import { isLightPalette, type StoryStyle } from './styles'

export interface BriefOptions {
  /** e.g. https://vizmaya.fyi */
  siteUrl: string
  /** Which site the story is for. Default vizmaya-fyi. */
  app?: HtmlStoryApp
  /**
   * A palette + font trio drawn from an existing story (see ./styles). Replaces
   * the house style in the brief. Omit for the house style.
   */
  style?: StoryStyle | null
  /**
   * Source material appended to the brief as its last section — for footshorts
   * the match context (see @vismay/content-source/footshortsMatchBrief's
   * buildMatchContext). Markdown; its headings are demoted under the brief's.
   */
  context?: string | null
  /**
   * A logged randomizer spin (vizmaya only): the brief gains the assignment,
   * research protocol, deliverables, output format, reel script and checklist
   * sections, and ends with the spin's research file (or its stub).
   */
  spin?: BriefSpin | null
  /**
   * A public Mapbox token (`pk.…`) to hand the agent for scrollytelling maps.
   * Omit to use the deployment's NEXT_PUBLIC_MAPBOX_TOKEN; null for no Mapbox
   * (the brief then points at MapLibre). Anything that isn't a public token is
   * ignored: the brief is served publicly, so a secret `sk.` token must never
   * reach it.
   */
  mapboxToken?: string | null
}

/** Pinned with the repo's own mapbox-gl dependency. */
const MAPBOX_GL_VERSION = '3.21.0'

/** The token to put in the brief, or null for none (see BriefOptions.mapboxToken). */
export function briefMapboxToken(option?: string | null): string | null {
  const raw = option === undefined ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : option
  const token = raw?.trim()
  return token && token.startsWith('pk.') ? token : null
}

/** The vizmaya house palette: the story reader's defaults. */
const VIZMAYA_PALETTE: ThemeColors = {
  background: '#0a0e14',
  surface: '#111820',
  text: '#e0ddd5',
  muted: '#5a6a70',
  line: '#1a2830',
  accent: '#D85A30',
  accent2: '#534AB7',
  teal: '#1D9E75',
}

/**
 * The footshorts house palette: the app's `classic` theme
 * (apps/footshorts/brand/src/themes/classic.ts). Brand orange-red is the
 * accent, the deeper brand red (the `terrace` theme's) the secondary, and the
 * app's green "live" pop the tertiary.
 */
const FOOTSHORTS_PALETTE: ThemeColors = {
  background: '#0B0B0F',
  surface: '#16161D',
  text: '#F4F4F5',
  muted: '#8E8E99',
  line: '#24242E',
  accent: '#F26A3C',
  accent2: '#C2410C',
  teal: '#00D26A',
}

export const HOUSE_PALETTES: Record<HtmlStoryApp, ThemeColors> = {
  'vizmaya-fyi': VIZMAYA_PALETTE,
  footshorts: FOOTSHORTS_PALETTE,
}

const HOUSE_STYLE: Record<HtmlStoryApp, string> = {
  'vizmaya-fyi': `House style (use it unless the story clearly wants its own look):
- Background \`#0a0e14\`, surface \`#111820\`, text \`#e0ddd5\`, muted \`#5a6a70\`, hairlines \`#1a2830\`.
- Accent \`#D85A30\` (the one colour that means "look here"), secondary \`#534AB7\`, teal \`#1D9E75\`.
- Type: Fraunces for headlines and big numbers, Inter for body, JetBrains Mono for
  labels, axes and data (all on Google Fonts). Body 18–20px, line-height 1.6,
  measure 60–70 characters.`,
  footshorts: `House style (the footshorts app's own look; use it unless the story clearly wants its own):
- A dark page. Background \`#0B0B0F\`, surface \`#16161D\`, text \`#F4F4F5\`, muted \`#8E8E99\`, hairlines \`#24242E\`.
- Accent \`#F26A3C\` (the brand orange-red: the one colour that means "look here"),
  secondary \`#C2410C\`, green \`#00D26A\` (the app's "live" pop — use it sparingly, for
  what is happening now or went right).
- Team colours are allowed on top of these, but only for the two or three teams
  the story is about, and only where a bar, line or badge stands for that team.
- Type: Forum for headlines and big numbers, Space Grotesk for body, Space Mono for
  labels, axes and data (all on Google Fonts:
  \`https://fonts.googleapis.com/css2?family=Forum&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap\`).
  Body 18–20px, line-height 1.6, measure 60–70 characters.`,
}

function styleSection(app: HtmlStoryApp, style: StoryStyle | null | undefined): string {
  if (!style) return HOUSE_STYLE[app]
  const { palette: c, fonts } = style
  const from =
    style.paletteFrom.slug === style.fontsFrom.slug
      ? `the "${style.paletteFrom.title}" story`
      : `existing stories (colours from "${style.paletteFrom.title}", type from "${style.fontsFrom.title}")`
  const status = [
    c.positive && `positive \`${c.positive}\``,
    c.amber && `warning \`${c.amber}\``,
    c.red && `negative \`${c.red}\``,
  ].filter(Boolean)
  const fontsUrl = getFontImportUrl(fonts)
  return `Style for this story. It was picked at random from ${from}
so this page gets its own look. Use it instead of the house style:
- ${isLightPalette(c) ? 'A light page' : 'A dark page'}. Background \`${c.background}\`, surface \`${c.surface}\`, text \`${c.text}\`, muted \`${c.muted}\`${c.line ? `, hairlines \`${c.line}\`` : ''}.
- Accent \`${c.accent}\` (the one colour that means "look here"), secondary \`${c.accent2}\`, tertiary \`${c.teal}\`.${status.length ? `\n- Status colours: ${status.join(', ')}.` : ''}
- Type: ${fonts.serif} for headlines and big numbers, ${fonts.sans} for body, ${fonts.mono} for
  labels, axes and data${fontsUrl ? ` (Google Fonts: \`${fontsUrl}\`)` : ''}. Body 18–20px, line-height 1.6,
  measure 60–70 characters.
- Keep these exact values. Use tints and shades of them for extra chart steps;
  don't introduce new hues.`
}

/** The "icons and flags" section; footshorts adds club crests. */
function iconsSection(app: HtmlStoryApp): string {
  const crests =
    app === 'footshorts'
      ? `
- **Crests: from the match context.** Each team in the match context comes with
  its crest URL. Show the crest beside the team name in stat cards, table rows
  and chart labels (\`<img src="…" alt="" width="20" height="20">\`, or an SVG
  \`<image>\` inside charts), the way flags sit beside countries. A crest always
  sits beside the name, never instead of it, and a team with no crest URL just
  gets its name. For national teams use the flag instead of a crest.`
      : ''
  return `## Icons${app === 'footshorts' ? ', crests' : ''} and flags

Use ${app === 'footshorts' ? 'them' : 'both'}. They make a page scannable, but they support the words and never replace them.

- **Icons: Phosphor.** Load
  \`https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css\`
  (swap \`regular\` for \`fill\` or \`duotone\` if you want those weights too), then
  write \`<i class="ph ph-trend-up" aria-hidden="true"></i>\`. Use them for section
  markers, stat cards, callouts and key-takeaway lists. Stick to one weight, and
  size them to the text they sit next to. Use no other icon set and no emoji.${crests}
- **Flags: flag-icons.** Whenever a country appears (a table row, a chart label,
  a stat card, a map callout${app === 'footshorts' ? ', a national team' : ''}), show its flag next to its name. Load
  \`https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/css/flag-icons.min.css\` and write
  \`<span class="fi fi-in"></span>\` (ISO 3166-1 alpha-2, lowercase; add \`fis\`
  for a square flag). Inside SVG charts, use
  \`<image href="https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/in.svg">\`
  (or \`flags/1x1/\` for round markers). Never use emoji flags: Windows shows them
  as two letters. A flag always sits beside the country name, never instead of it.`
}

/** The "Maps" section: Mapbox scrollytelling, given a public token. */
function mapsSection(app: HtmlStoryApp, token: string): string {
  const places =
    app === 'footshorts'
      ? "a title race's away days, a club's scouting map, a tournament's host cities"
      : 'a trade route, a river basin, where the plants or the outbreaks cluster'
  return `## Maps: Mapbox scrollytelling

When the story happens somewhere (${places}), tell that part on a Mapbox map
that moves as the reader scrolls. Skip it when the place is incidental: a map
that only shows where a country is doesn't earn a screen.

Setup:
- Load \`https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js\` and
  \`https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css\`.
- Token: \`mapboxgl.accessToken = '${token}'\`. It is a public token, made to sit
  in page source. If tiles don't load in a local preview, check the posted
  draft before changing anything: the token may only allow the site.
- Basemap: \`mapbox://styles/mapbox/dark-v11\` on a dark page, \`light-v11\` on a
  light one. On \`style.load\`, pull it toward your palette with
  \`setPaintProperty\` (land and background to your background and surface,
  water a shade of them, roads and POI labels hidden, place labels small and
  muted) so your data is the brightest thing on screen.
- \`projection: 'globe'\` for a story that crosses continents, \`'mercator'\` for a
  city or a region.
- Keep the Mapbox logo and attribution visible: the terms require it.
- The sandbox has no storage and no Cache API. Mapbox GL copes and falls back to
  the network; a one-off console warning about its cache is expected, not a bug.

The pattern:
- **One map, sticky.** One map per page, reused by every step (browsers cap
  WebGL contexts). It sits in a \`position: sticky; top: 0; height: 100svh\`
  container and the text steps scroll past it as cards on your surface colour.
  Desktop: a 360–420px text column beside the map. Phones: the map fills the
  screen and the cards pass over it, one step per screen.
- **Chapters.** Each step is \`<section data-step data-chapter="…">\` and maps to
  one chapter in a JS array: a camera (\`center\`, \`zoom\`, \`pitch\`, \`bearing\`)
  plus at most one data change (show a layer, highlight a feature, extend a
  route). One step, one move, one point.
- **Trigger.** IntersectionObserver (a step is active when it crosses the middle
  of the viewport) or Scrollama. On enter, \`map.flyTo({ ...camera, padding,
  duration: 2000, essential: true })\`. Scrolling back up replays the earlier
  chapter, so each chapter sets the whole state it needs, not a diff.
- **Padding.** Pass \`padding\` to \`flyTo\` so the subject lands in the visible part
  of the map, not under the text card: left or right padding beside the desktop
  column, bottom padding on phones.
- **Scroll stays the page's.** \`interactive: false\`, so the map never eats a
  scroll or a swipe. If you want a free-explore map, put it after the
  scrollytelling, with \`cooperativeGestures: true\`.
- **Data.** GeoJSON inline in the page or from an absolute https URL. Add every
  source and layer once, on \`load\`, at zero opacity, and let chapters fade them
  with \`setPaintProperty\` (\`fill-opacity\`, \`line-opacity\`, \`circle-opacity\`)
  rather than adding and removing layers. Grow routes with \`lineMetrics: true\`
  and an animated \`line-trim-offset\`. A step entered before \`load\` fires is
  applied when it does.
- **Colour and labels.** The chart rules hold: accent for the subject, grey for
  context, features labelled on the map rather than in a legend (a small key in
  the card is fine for a colour scale), flags beside country names.
- **Reduced motion.** \`jumpTo\` instead of \`flyTo\`, and routes appear whole.
- **Fallback.** Give the map container a background image from the Static
  Images API at the first chapter's camera
  (\`https://api.mapbox.com/styles/v1/mapbox/<your basemap>/static/<lng>,<lat>,<zoom>,<bearing>,<pitch>/1280x1280@2x?access_token=${token}\`),
  so a failed script or no WebGL still shows the place, and write each step so
  it reads on its own.
- **Check it.** At 375×812, scroll through every step: the step's subject is on
  screen and not under its card, and labels don't collide.`
}

function contentSection(app: HtmlStoryApp, hasContext: boolean): string {
  const meta = HTML_STORY_APP_META[app]
  if (app !== 'footshorts') {
    return `## Content

- Every number has a source. End with a "Sources & method" section of links.
- Byline "${meta.desk}" plus the date.
- Write plainly. No hype. Lead with the finding.`
  }
  const contextRules = hasContext
    ? `- **The match context at the end of this brief is your primary source.** Every
  scoreline, minute, scorer, stat and table row comes from it, verbatim: never
  round a score, move a goal to another minute, or derive a season claim the
  context does not make (quote an Opta insight instead). If a figure you want is
  not in the context, say so in the page rather than inventing it.
- Lead with WHY the result happened (17 shots for 1.8 xG is a different story
  from 4 shots for 1.8 xG), then the moments in the order the timeline gives them,
  then what it means for the table and the fixtures to come.
- Paraphrase the commentary; never present it as someone's quoted words.
- Link each match to its footshorts match page (the URL is in the context).`
    : `- Every number has a source. If the brief carries no match context, build the
  page from the sources you are given and link every figure to one.`
  return `## Content

${contextRules}
- Sources & method: end with a short section of links — the footshorts match
  pages, plus "Opta via theanalyst.com match centre" for the stats, insights and
  commentary, and "football-data.org" for fixtures and tables.
- Byline "${meta.desk}" plus the date.
- Write like a good match report, not a press release: plain, specific, no hype.
  Lead with the finding.`
}

/** Demote `# ` and `## ` headings so the appended context nests under the brief's own. */
function demoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,5}) /gm, (_m, hashes: string) => `${hashes}# `)
}

export function htmlStoryBrief({
  siteUrl,
  app = DEFAULT_HTML_STORY_APP,
  style,
  context,
  spin,
  mapboxToken,
}: BriefOptions): string {
  const site = siteUrl.replace(/\/$/, '')
  const mapbox = briefMapboxToken(mapboxToken)
  const meta = HTML_STORY_APP_META[app]
  const siteName = site.replace(/^https?:\/\//, '')
  const hasContext = !!context?.trim()
  const assignment = spin
    ? `
${assignmentSection(spin)}

${researchProtocolSection(spin)}

${deliverablesSection(spin, site)}

${formatSection(spin)}
`
    : ''
  const chrome =
    app === 'footshorts'
      ? `The only thing added is a slim Footshorts header (the mark and the app's
navigation) above your page and a Footshorts footer below it`
      : `The only thing added is a slim vizmaya header (logo) above
your page and a vizmaya footer below it`
  const footshortsMcp = app === 'footshorts' ? ' and `app: "footshorts"`' : ''

  return `# Writing a ${meta.name} HTML story

You are writing one finished ${app === 'footshorts' ? 'football data story for Footshorts' : 'data story for vizmaya.fyi'} as a single,
self-contained HTML file. It is hosted exactly as you write it at
${site}/s/<slug>. ${chrome}, so don't add your own site logo,
masthead or site footer. Everything in between is yours: the design, the
charts, and the words.
${assignment}
## The hosting contract (must)

1. One complete document: \`<!doctype html>\`, \`<html lang="en">\`, \`<head>\`, \`<body>\`.
2. In \`<head>\`:
   - \`<meta charset="utf-8">\`
   - \`<meta name="viewport" content="width=device-width, initial-scale=1">\`
   - \`<title>\`: the story headline. It becomes the story's title.
   - \`<meta name="description">\`: a one-sentence summary.
   - \`og:title\`, \`og:description\`, \`og:image\` (absolute https URL, 1200×630) and \`twitter:card\` = \`summary_large_image\`.
   - \`<meta name="${THEME_META_NAME}" content="${themeMetaContent(style?.palette ?? HOUSE_PALETTES[app])}">\`:
     your page's colours, as hex. The ${meta.name} header, footer and logo are tinted
     to match. Copy it as given, and update it if you change the palette.
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
Graphics, NYT Upshot${app === 'footshorts' ? ', The Athletic' : ''}): editorial, calm, confident. One idea per screen.

${styleSection(app, style)}
- Lots of space. Big standalone numbers. Short paragraphs. Pull quotes sparingly.

${iconsSection(app)}

## Motion and scroll animation

Animate on scroll. The page should feel alive as the reader moves through it:
- **Reveal**: text blocks, stat cards and charts fade in and rise 16–24px as they
  enter the viewport (400–700ms, ease-out, once only). Stagger siblings by ~80ms.
- **Charts build when seen**: bars grow from zero, lines draw from left to right,
  points and labels follow. Start this when the chart scrolls into view, not on
  page load.
- **Big numbers count up** to their value when they appear.
- **Scrollytelling** when the data has a sequence: a sticky graphic with text
  steps that change it. Mark each step \`<section data-step>\`.${
    mapbox ? ' When the sequence moves through places, the sticky graphic is a map (see Maps).' : ''
  }${
    app === 'footshorts'
      ? `
  A match timeline is exactly this: the scoreline, xG race or momentum graphic
  stays put while the goals, cards and substitutions step past it.`
      : ''
  }

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
  ones. ${
    mapbox
      ? `For maps, see Maps below; D3-geo with world-atlas/us-atlas TopoJSON is fine
  for a small static choropleth or locator.`
      : `For maps, use D3-geo with world-atlas/us-atlas TopoJSON, or MapLibre GL
  with free tiles. Don't use Mapbox: this deployment has no token for it.`
  }
- Each chart makes one point, and its title states that point ("${
    app === 'footshorts' ? 'Arsenal had the ball, Chelsea had the chances' : 'Exports doubled after 2019'
  }", not "${app === 'footshorts' ? 'Possession and shots' : 'Exports 2015–2024'}").
- Label lines and bars directly instead of using legends. Use at most 5–6 colours,
  grey for context and the accent for the subject.
- Bars start at zero. Show units. Use tabular numerals. Round sensibly.
- Put a source line under every chart, linked to the original.
- On phones, labels must not overlap or clip: shorten them, rotate nothing, and
  drop to fewer ticks. Test this.${spin ? chartRules(spin).map((r) => `\n- ${r}`).join('') : ''}
${mapbox ? `\n${mapsSection(app, mapbox)}\n` : ''}
${spin ? spinContentSection(meta.desk) : contentSection(app, hasContext)}
${spin ? `\n${reelScriptSection()}\n` : ''}
## Before you post: check your own work

If you can run a browser, render the page at 375×812 and 1440×900 and look at
the screenshots. Then fix:
- text or labels overflowing, overlapping, or cut off
- anything wider than the viewport
- console errors, and charts that are empty or blank
- low-contrast text

If you can't render it, re-read your chart code for these specific failures.
${spin ? `\n${checklistSection(spin)}\n` : ''}
## Posting

Pick the first one you can do:
- **MCP tool**: call \`publish_html_story\` with \`slug\` and \`html\`${footshortsMcp}.
- **HTTP**: \`POST ${site}/api/html-stories?slug=<slug>\` with the HTML as the
  body (\`Content-Type: text/html\`) and \`Authorization: Bearer $HTML_STORIES_TOKEN\`.
  Add \`&publish=1\` to make it public right away; otherwise it saves as a draft.
  The response lists \`warnings\`. Fix them and post again to the same slug.
- **Otherwise**: give the user the complete HTML file. They will paste it into
  the admin's HTML stories tab for ${siteName}.

Slugs are lowercase words joined by hyphens, e.g. \`${
    app === 'footshorts' ? 'arsenal-chelsea-xg-gap-2026' : 'india-solar-boom-2026'
  }\`.
Posting to an existing slug replaces it; older versions stay restorable.
${spin ? `\n${postingLines(spin)}\n` : ''}${
  hasContext
    ? `
---

# Source material

Everything below comes from the ${meta.name} match tables. It is the story's
evidence; the rules above say how to use it.

${demoteHeadings(context!.trim())}
`
    : ''
}${
  spin
    ? `
---

${researchAppendix(spin)}
`
    : ''
}`
}

import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { generateText, hasGatewayCredentials } from '@vismay/ai-gateway'
import type { ExtractedSource } from '@vismay/story-pipeline/ingest'

const ROOT = path.resolve(__dirname, '..', '..')
const STORIES_DIR = path.join(ROOT, 'content/stories')
const EXAMPLE_SLUG = 'south-korea-gpu-hour'

/**
 * What the model must produce. We deliberately keep raw strings for .md,
 * .config.yaml, and .share.yaml — the model writes directly in the target
 * format, we just validate parseability before writing to disk.
 */
export interface StructuredStory {
  /** Suggested slug (may differ from the one provided on the CLI). */
  suggestedSlug?: string
  /** Complete contents of <slug>.md, including YAML frontmatter. */
  markdown: string
  /** Complete contents of <slug>.config.yaml. */
  configYaml: string
  /** Complete contents of <slug>.share.yaml. */
  shareYaml: string
  /** Data-driven chart JSONs, one file each under <slug>/charts/<id>.json. */
  charts: Array<{ id: string; json: unknown }>
  /** Free-text summary of assumptions / TODOs for the author to review. */
  notes: string
}

/**
 * Output schema for the structured-output call. Claude fills it via tool
 * calling, so there's no free-form JSON to scrape. Chart bodies are arbitrary
 * ECharts options, hence `unknown`.
 */
const StructuredStorySchema = z.object({
  suggestedSlug: z.string().optional(),
  markdown: z.string(),
  configYaml: z.string(),
  shareYaml: z.string(),
  charts: z.array(z.object({ id: z.string(), json: z.unknown() })),
  notes: z.string(),
})

export async function structure(source: ExtractedSource, slug: string): Promise<StructuredStory> {
  if (!hasGatewayCredentials()) {
    throw new Error('AI_GATEWAY_API_KEY not set — add it to .env or export it.')
  }

  const exampleMd = fs.readFileSync(path.join(STORIES_DIR, `${EXAMPLE_SLUG}.md`), 'utf8')
  const exampleConfig = fs.readFileSync(
    path.join(STORIES_DIR, `${EXAMPLE_SLUG}.config.yaml`),
    'utf8'
  )
  const exampleShare = fs.readFileSync(
    path.join(STORIES_DIR, `${EXAMPLE_SLUG}.share.yaml`),
    'utf8'
  )

  const prompt = buildPrompt({
    source,
    slug,
    exampleMd,
    exampleConfig,
    exampleShare,
  })

  // Whole-document → structured story is the hardest text job we have, so it
  // runs on the heavy Claude tier. The scaffold is long (four files' worth of
  // text), hence the generous output budget.
  const { result } = await generateText({
    model: 'text.opus',
    prompt,
    schema: StructuredStorySchema,
    temperature: 0.4,
    maxOutputTokens: 32_000,
    metadata: { feature: 'story-ingest-structure' },
  })
  const parsed = normalise(result)

  // Validate YAML parseability of both config files. If the model emits
  // invalid YAML we abort here rather than writing a broken scaffold.
  try {
    parseYaml(parsed.configYaml)
  } catch (err) {
    throw new Error(`structurer emitted invalid .config.yaml: ${(err as Error).message}`)
  }
  try {
    parseYaml(parsed.shareYaml)
  } catch (err) {
    throw new Error(`structurer emitted invalid .share.yaml: ${(err as Error).message}`)
  }

  return parsed
}

function normalise(obj: z.infer<typeof StructuredStorySchema>): StructuredStory {
  return {
    suggestedSlug: obj.suggestedSlug,
    markdown: obj.markdown,
    configYaml: obj.configYaml,
    shareYaml: obj.shareYaml,
    // An open-ended `unknown` field occasionally comes back as a JSON string
    // rather than an object — parse it so the chart file isn't double-encoded.
    charts: obj.charts.map((c) => ({ id: c.id, json: parseMaybeJson(c.json) })),
    notes: obj.notes ?? '',
  }
}

function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

function buildPrompt(input: {
  source: ExtractedSource
  slug: string
  exampleMd: string
  exampleConfig: string
  exampleShare: string
}): string {
  return `You are converting a source article into a Vizmaya story scaffold.

Vizmaya is a scroll-synced storytelling framework: each scene pairs a Mapbox
camera state (center, zoom, optional pins, choropleth regions, or heatmap)
with a markdown text card, and optionally a foreground chart that steps
forward as the reader scrolls.

# Your output

Fill in the structured output with these fields (shape shown as JSON):

{
  "suggestedSlug": "short-kebab-slug-based-on-topic",
  "markdown":   "<entire <slug>.md file, including YAML frontmatter>",
  "configYaml": "<entire <slug>.config.yaml file>",
  "shareYaml":  "<entire <slug>.share.yaml file>",
  "charts": [
    { "id": "chart-id-kebab", "json": { "steps": [ { "title": "...", "option": { ... ECharts option ... } } ] } }
  ],
  "notes": "<plain text — list anything the human author needs to review, placeholder coordinates, missing data, etc.>"
}

# Theme color tokens

Any string that begins with \`$\` in YAML or chart JSON is resolved at
render time against the story's theme. Use tokens — never raw hex —
so the whole story reflows when the theme changes. Full token list:

  $accent, $accent2, $teal, $muted, $line, $surface,
  $positive  (greens; gains, growth, good)
  $red       (losses, declines, warnings)
  $amber     (neutral mid / caution)
  $green     (alias of $positive in chart palette)
  $text, $bg (body text + page background)

# Rules

1. **Markdown structure** — frontmatter has: title, subtitle, byline, date,
   theme (colors + fonts). Pick theme colors that match the article's tone;
   the example story used a nautical blue. Use absolute ISO dates.
2. **Config sections** — each section's \`text\` string MUST match a \`##\`
   heading in the markdown verbatim. Stat sections (\`kind: stat\`) render
   the heading as a giant number. Hero uses \`kind: hero\`.
3. **Map states** —
   - Use \`pins\` for single-location reveals (coordinates as [lng, lat]).
   - Use \`regions\` for choropleths. Two levels exist:
     - \`level: country\` uses Mapbox's built-in country boundaries and
       expects ISO 3166-1 alpha-2 codes (e.g. "IN", "US").
     - \`level: custom\` requires \`geojsonUrl\` (pointing at a publicly
       served GeoJSON file) and \`idProperty\` (the feature property used
       to match items[].code). Use this for subnational geography.
   - Use \`heatmap\` for density of point events with optional weights.
   - Region shape (YAML) — two valid authoring styles:

     (a) Ramp style — single metric, monotonic color scale:
         regions:
           level: country | custom
           geojsonUrl: ...         # level: custom only
           idProperty: ...         # level: custom only
           colors: ["$surface", "$positive"]   # N ≥ 2
           ramp: [0, 13]           # same length as colors (optional; auto)
           items:
             - code: "33"
               value: 13

     (b) Diverging style — mixed signs, color carries sign and opacity
         carries magnitude. Preferred when the data has BOTH gains and
         losses (seat-change, price-change, population-change, etc.):
         regions:
           level: custom
           geojsonUrl: ...
           idProperty: ...
           items:
             - code: "33"          # Uttar Pradesh
               color: "$positive"  # sign → color
               opacity: 1.00       # |value| / max, clamped to [0.2, 1.0]
             - code: "31"          # Tamil Nadu
               color: "$red"
               opacity: 0.85

4. **Subnational region IDs are fragile** — when using a custom GeoJSON you
   must know the exact value of its \`idProperty\` for each feature. DO NOT
   guess numeric ids (e.g. assuming ID_1=1 means "the first state
   alphabetically"). If you cannot verify the id mapping from the source
   material, either:
     (a) pick a GeoJSON whose \`idProperty\` is a stable string like
         ISO 3166-2 or the state name, or
     (b) list the states you intend to use in \`notes\` and add each code
         as a placeholder with a "TODO: verify ID_1 mapping" comment.
   Always annotate \`items[].code\` with a trailing \`# state/region name\`
   comment so a human can audit the mapping.

5. **Semantic map coloring** — when the source compares winners and
   losers (gains/losses, gainers/decliners, surplus/deficit), pair the
   main comparison chart with a diverging choropleth on the SAME section
   (the map is the backdrop while the chart steps through). Positive
   values → \`$positive\` (green), negative → \`$red\`. Opacity = magnitude
   as described above. This turns the map into a live legend for the chart.

6. **Charts** — every \`chart:\` value in the config must be prefixed with
   \`data:\` and match one of the ids in the \`charts\` array. The
   GenericChart component renders these. Use theme tokens (see list above)
   throughout the ECharts option — never raw hex.

   Chart styling conventions (copy these defaults unless you have a reason
   not to):

     xAxis / yAxis:
       axisLine: { show: false }
       axisTick: { show: false }
       axisLabel: { color: "$text" }          # bright, readable
       splitLine: { lineStyle: { color: "$line" } }  # dim grid (value axis only)

     Backgrounds: transparent. Tooltips: \`backgroundColor: "$surface"\`,
     \`textStyle.color: "$text"\`, \`borderColor: "$line"\`.

     For diverging bar data (mixed positive + negative values), set
     \`itemStyle.color\` on each \`data\` entry using \`$positive\` /
     \`$red\` based on the sign — do NOT rely on a single series color,
     or every bar will end up the same color.

7. **Don't invent data**. If the source doesn't give you a number, don't
   fabricate one. Leave it out and add a TODO in \`notes\`.
8. **Coordinates** — if the source names a place but gives no coordinates,
   use known real-world coordinates. For unnamed or ambiguous locations,
   leave a placeholder and add a TODO.
9. **Share overrides** — keep \`shareYaml\` minimal (usually just
   \`sections: {}\`) unless the source really needs share-specific cropping.
10. **Pacing** — target 8–15 sections. Hero + a stat anchor are strong
    openers. Close with methodology if the source has sources/methods.

# Example story (for reference — do NOT copy its topic)

<example-markdown>
${input.exampleMd}
</example-markdown>

<example-config>
${input.exampleConfig}
</example-config>

<example-share>
${input.exampleShare}
</example-share>

# The source to convert

Target slug: \`${input.slug}\`

Title: ${input.source.title}
Byline: ${input.source.byline ?? '(unknown)'}

Body:
<source>
${input.source.body}
</source>

Now produce the bundle described above.`
}

import matter from 'gray-matter'
import { stringify as stringifyYaml } from 'yaml'
import { appendStorySection } from '@vismay/content-source/storySection'
import { buildChartData } from './chart'
import { COVER_ANCHOR, completeCoverBody, coverImageLayer, isDeckCover } from './cover'
import { defaultsFor } from './defaults'
import type { ConfigFormat, GeneratedStory, StoryArtifacts } from './types'

/**
 * Turn a generated story into the write-ready file set. Each section is folded
 * in through `appendStorySection` (content-source) so the markdown `## anchor`
 * and the config `text` field are written from the same string and can never
 * diverge. Chart specs become ECharts option JSON deterministically.
 *
 * The first deck `cover` section gets the editorial-cover treatment: it anchors
 * at `## Cover` (id `cover`, the display title moves to the config `heading`)
 * and its full-bleed hero image is attached, pointing at the asset key the
 * compose image step uploads to.
 */
export function serializeStory(
  story: GeneratedStory,
  opts: { configFormat?: ConfigFormat } = {},
): StoryArtifacts {
  const configFormat = opts.configFormat ?? 'yaml'
  // Start from frontmatter + empty body, and a `defaults` block for the format.
  // The config base is serialized in the target format; each section is then
  // folded in through `appendStorySection`, which appends in the same format.
  let markdown = matter.stringify('', story.frontmatter)
  let configYaml =
    configFormat === 'json'
      ? JSON.stringify({ defaults: defaultsFor(story.format) }, null, 2) + '\n'
      : stringifyYaml({ defaults: defaultsFor(story.format) }, { lineWidth: 0 })

  let coverDone = false
  for (const section of story.sections) {
    // Only the FIRST cover is the editorial cover — a second `## Cover` anchor
    // would collide in the markdown namespace.
    const asCover = !coverDone && isDeckCover(story.format, section.kind)
    if (asCover) coverDone = true
    const res = appendStorySection(markdown, configYaml, {
      heading: asCover ? COVER_ANCHOR : section.heading,
      paragraphs: section.paragraphs,
      // Normalise a deck opener the model labelled `hero` to the canonical
      // `cover` kind so the stored config matches its `## Cover` anchor and the
      // deck convention (the reader treats hero/cover alike; `cover` is the
      // deck value).
      kind: asCover ? 'cover' : section.kind,
      body: asCover
        ? completeCoverBody(section.body, {
            heading: section.heading,
            image: coverImageLayer(story.slug, story.imagePrompts, section.heading),
          })
        : section.body,
      subsections: section.subsections,
    }, configFormat)
    markdown = res.markdown
    configYaml = res.configYaml
  }

  const charts = story.charts.map((c) => ({
    id: c.id,
    json: JSON.stringify(buildChartData(c), null, 2),
  }))

  return {
    slug: story.slug,
    markdown,
    configYaml,
    configFormat,
    charts,
    imagePrompts: story.imagePrompts,
  }
}

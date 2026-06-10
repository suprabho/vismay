import matter from 'gray-matter'
import { stringify as stringifyYaml } from 'yaml'
import { appendStorySection } from '@vismay/content-source/storySection'
import { buildChartData } from './chart'
import { defaultsFor } from './defaults'
import type { GeneratedStory, StoryArtifacts } from './types'

/**
 * Turn a generated story into the write-ready file set. Each section is folded
 * in through `appendStorySection` (content-source) so the markdown `## anchor`
 * and the config `text` field are written from the same string and can never
 * diverge. Chart specs become ECharts option JSON deterministically.
 */
export function serializeStory(story: GeneratedStory): StoryArtifacts {
  // Start from frontmatter + empty body, and a `defaults` block for the format.
  let markdown = matter.stringify('', story.frontmatter)
  let configYaml = stringifyYaml({ defaults: defaultsFor(story.format) }, { lineWidth: 0 })

  for (const section of story.sections) {
    const res = appendStorySection(markdown, configYaml, {
      heading: section.heading,
      paragraphs: section.paragraphs,
      kind: section.kind,
      body: section.body,
      subsections: section.subsections,
    })
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
    charts,
    imagePrompts: story.imagePrompts,
  }
}

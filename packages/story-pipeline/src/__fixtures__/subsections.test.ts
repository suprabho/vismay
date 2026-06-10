/** Throwaway check: subsection serialization through appendStorySection
 *  (run: npx tsx src/__fixtures__/subsections.test.ts) */
import { parse as parseYaml } from 'yaml'
import { appendStorySection } from '@vismay/content-source/storySection'

const base = appendStorySection('', 'defaults: {}\n', {
  heading: 'A Record Year',
  paragraphs: ['Cover hook.'],
  kind: 'cover',
  body: { map: { center: [78.9, 22.5], zoom: 4 } },
})

const res = appendStorySection(base.markdown, base.configYaml, {
  heading: 'The Nordic Wall',
  paragraphs: [],
  kind: 'text',
  body: {
    map: { center: [12, 58], zoom: 3.4, regions: { level: 'country', items: [{ code: 'NO', value: 92.7 }] } },
  },
  subsections: [
    {
      heading: 'Norway, the constant',
      paragraphs: ['Norway holds the top rank.', 'Its score barely moved.'],
      map: { center: [10.5, 62.5], zoom: 4.2, pins: [{ coordinates: [10.75, 59.91], label: 'Oslo — 92.7' }] },
    },
    { heading: 'The Baltic surprise', paragraphs: ['Estonia climbs.'], map: { center: [25, 58.7], zoom: 4.5 } },
  ],
})

// Markdown: sub anchors present, parent heading absent.
const mdHas = (h: string) => res.markdown.includes(`## ${h}`)
console.log('md has sub 1 anchor        ', mdHas('Norway, the constant') ? '✓' : '✗')
console.log('md has sub 2 anchor        ', mdHas('The Baltic surprise') ? '✓' : '✗')
console.log('md omits parent anchor     ', !mdHas('The Nordic Wall') ? '✓' : '✗ parent block written')
console.log('md keeps earlier section   ', mdHas('A Record Year') ? '✓' : '✗')

// Config: parent entry has no text, carries map + subsections [{text, map}].
const cfg = parseYaml(res.configYaml) as { sections: Array<Record<string, unknown>> }
const parent = cfg.sections.find((s) => s.id === 'the-nordic-wall')
if (!parent) {
  console.log('✗ parent entry missing; sections =', cfg.sections.map((s) => s.id))
} else {
  console.log('parent has no text         ', !('text' in parent) ? '✓' : `✗ text=${String(parent.text)}`)
  console.log('parent keeps map+regions   ', !!(parent.map as Record<string, unknown>)?.regions ? '✓' : '✗')
  const subs = parent.subsections as Array<{ text: string; map?: { pins?: unknown[] } }>
  console.log('config subsections         ', subs?.map((s) => s.text).join(' | '))
  console.log('sub 1 carries pins         ', subs?.[0]?.map?.pins?.length === 1 ? '✓' : '✗')
}
console.log('\n--- config ---\n' + res.configYaml)

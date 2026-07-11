/** Throwaway check: a deck editorial cover renders title-over-scrim from its
 *  own heading/eyebrow/dek and legitimately carries no map and no image layer.
 *  A section-root `layout: hero-full-bleed` (or an explicit `cover` kind) with
 *  no declared layer slot must be normalised to an empty `foreground` so it
 *  validates instead of falling through to the legacy `map.center` check and
 *  404ing the whole story. Map-story heroes (no hero-full-bleed layout) keep
 *  their genuine missing-map validation.
 *  (run: npx tsx src/storyConfigCover.test.ts)
 */
import { loadStoryConfig } from './storyConfig'
import { __setContentSourceForTests, type ContentSource } from './contentSource'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

/** Minimal content source that serves one JSON config for `slug`. loadStoryConfig
 *  only reaches for `readConfig`, so the rest can throw. */
function stubSource(slug: string, config: unknown): ContentSource {
  return {
    async readConfig(s) {
      return s === slug ? { text: JSON.stringify(config), format: 'json' } : null
    },
  } as unknown as ContentSource
}

async function main() {
  // A deck cover shaped like the footshorts "Full Time" match stories: the
  // opener is `kind: hero` with `layout: hero-full-bleed`, an eyebrow and dek,
  // but no foreground/background and no map. Before the guard this threw
  // "missing 'map.center'" and 404'd the reader.
  __setContentSourceForTests(
    stubSource('full-time', {
      sections: [
        {
          id: 'lede',
          text: "Merino's Magic",
          kind: 'hero',
          layout: 'hero-full-bleed',
          eyebrow: 'FIFA World Cup',
          dek: 'Off the bench in the 86th, a winner in the 88th.',
        },
        { id: 'closing', text: 'Closing', kind: 'closing', foreground: [] },
      ],
    })
  )
  try {
    const cfg = await loadStoryConfig('full-time')
    ok('hero-full-bleed cover with no slot validates', true)
    ok(
      'cover section is normalised to an empty foreground',
      Array.isArray(cfg.sections[0].foreground) &&
        (cfg.sections[0].foreground as unknown[]).length === 0
    )
    ok('cover section keeps its kind', cfg.sections[0].kind === 'hero')
  } catch (e) {
    ok('hero-full-bleed cover with no slot validates', false, (e as Error).message)
  }

  // Explicit `kind: cover` with no slot is also rescued.
  __setContentSourceForTests(
    stubSource('coverkind', { sections: [{ id: 'c', text: 'Cover', kind: 'cover' }] })
  )
  try {
    const cfg = await loadStoryConfig('coverkind')
    ok(
      'kind:cover with no slot is rescued',
      Array.isArray(cfg.sections[0].foreground)
    )
  } catch (e) {
    ok('kind:cover with no slot is rescued', false, (e as Error).message)
  }

  // Negative control: a genuine map-style section (kind hero, NO hero-full-bleed
  // layout, no slot, no map) must STILL throw — the guard must not swallow real
  // missing-map errors on map stories.
  __setContentSourceForTests(
    stubSource('mapcase', { sections: [{ id: 's', text: 'Some text', kind: 'hero' }] })
  )
  let threw = false
  try {
    await loadStoryConfig('mapcase')
  } catch {
    threw = true
  }
  ok('map-style section still throws on missing map.center', threw)

  __setContentSourceForTests(null)
  console.log(failures === 0 ? '\nAll passed.' : `\n${failures} failure(s).`)
  if (failures > 0) process.exitCode = 1
}

void main()

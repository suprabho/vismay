/** Throwaway check: a deck opener may come back labelled `cover` OR `hero`
 *  (the deck kind enum offers both and the outline lint's COVER_KINDS accepts
 *  either). `isDeckCover` must recognise both so a deck `hero` opener still
 *  routes through `completeCoverBody` — otherwise it ships with no foreground
 *  and `loadStoryConfig` 404s the story on "missing 'map.center'". Map heroes
 *  must NOT be treated as deck covers.
 *  (run: npx tsx src/coverKind.test.ts)
 */
import { isDeckCover } from './cover'

let failures = 0
const ok = (label: string, pass: boolean) => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}`)
}

ok('deck + cover is a deck cover', isDeckCover('deck', 'cover') === true)
ok('deck + hero is a deck cover', isDeckCover('deck', 'hero') === true)
ok('deck + stat is not a deck cover', isDeckCover('deck', 'stat') === false)
ok('deck + bodyText is not a deck cover', isDeckCover('deck', 'bodyText') === false)
ok('deck + undefined is not a deck cover', isDeckCover('deck', undefined) === false)
ok('map + hero is NOT a deck cover', isDeckCover('map', 'hero') === false)
ok('map + cover is NOT a deck cover', isDeckCover('map', 'cover') === false)

console.log(failures === 0 ? '\nAll passed.' : `\n${failures} failure(s).`)
if (failures > 0) process.exitCode = 1

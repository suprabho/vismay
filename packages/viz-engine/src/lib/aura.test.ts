/** Throwaway check for the aura URL builders + backdrop resolution shared by
 *  the live page and every export surface.
 *  (run: npx tsx src/lib/aura.test.ts) */
import {
  AURA_ORIGIN,
  auraEmbedUrl,
  auraCaptureUrl,
  resolveStoryBackground,
  overlayBackground,
} from './aura'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

// ── auraEmbedUrl ─────────────────────────────────────────────────────────────
ok(
  'embed: defaults to input=off theme=light with text/icons hidden',
  auraEmbedUrl('foo-bar') ===
    `${AURA_ORIGIN}/embed/foo-bar?hideText=true&hideIcons=true&input=off&theme=light`
)
ok('embed: mic input', auraEmbedUrl('foo', { input: 'mic' }).includes('input=mic'))
ok('embed: slug is URL-encoded', auraEmbedUrl('a b/c').includes('/embed/a%20b%2Fc?'))

// ── auraCaptureUrl ───────────────────────────────────────────────────────────
ok(
  'capture: w/h/dpr query, dpr defaults to 1',
  auraCaptureUrl('scene', { w: 1920, h: 1080 }) ===
    `${AURA_ORIGIN}/scenes/scene/capture.png?w=1920&h=1080&dpr=1`
)
ok(
  'capture: explicit dpr + rounded fractional size',
  auraCaptureUrl('scene', { w: 390 * (5 / 4), h: 487.5, dpr: 2 }).endsWith('?w=488&h=488&dpr=2')
)
ok('capture: slug is URL-encoded', auraCaptureUrl('a b', { w: 1, h: 1 }).includes('/scenes/a%20b/'))

// ── resolveStoryBackground ───────────────────────────────────────────────────
const explicit = { type: 'color' as const, value: '#000' }
ok('resolve: explicit config wins over frontmatter aura', resolveStoryBackground(explicit, 'x') === explicit)
ok(
  'resolve: frontmatter aura → aura config',
  JSON.stringify(resolveStoryBackground(undefined, 'my-scene')) === '{"type":"aura","slug":"my-scene"}'
)
ok('resolve: whitespace-only aura → none', resolveStoryBackground(undefined, '  ').type === 'none')
ok('resolve: nothing → none', resolveStoryBackground(undefined, undefined).type === 'none')

// ── overlayBackground ────────────────────────────────────────────────────────
ok('overlay: undefined → undefined', overlayBackground(undefined) === undefined)
ok('overlay: empty block → undefined', overlayBackground({}) === undefined)
ok('overlay: color only', overlayBackground({ color: '#123456' }) === '#123456')
ok('overlay: hex + opacity → rgba', overlayBackground({ color: '#000', opacity: 0.5 }) === 'rgba(0, 0, 0, 0.5)')
ok(
  'overlay: non-hex + opacity → color-mix',
  overlayBackground({ color: 'var(--color-bg)', opacity: 0.25 }) ===
    'color-mix(in srgb, var(--color-bg) 25%, transparent)'
)
ok(
  'overlay: linear gradient default direction',
  overlayBackground({ gradient: { type: 'linear', from: 'a', to: 'b' } }) === 'linear-gradient(to bottom, a, b)'
)
ok(
  'overlay: radial gradient',
  overlayBackground({ gradient: { type: 'radial', from: 'a', to: 'b' } }) ===
    'radial-gradient(circle at center, a, b)'
)
ok(
  'overlay: gradient stacks above color',
  overlayBackground({ color: '#fff', gradient: { type: 'linear', from: 'a', to: 'b', angle: '90deg' } }) ===
    'linear-gradient(90deg, a, b), #fff'
)

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { locatePass, pickPass, type LapChannels, type RecapInputs } from './buildRecap'
import { findMoments, passKey, replayMomentsMarkdown, type LocatedPass } from './moments'

// The 2024 Austrian Grand Prix (see buildRecap.test.ts for what the fixture holds).
const fx = JSON.parse(readFileSync(new URL('./__fixtures__/austria-2024.json', import.meta.url), 'utf8')) as {
  inputs: RecapInputs
  channels: { a: LapChannels | null; b: LapChannels | null }
}

test('2024 Austrian GP: the replay moments, with cues', () => {
  const pass = pickPass(fx.inputs)!
  const loc = locatePass(fx.channels, fx.inputs.corners)!
  assert.equal(loc.corner, 'Turn 6')
  const located = new Map<string, LocatedPass>([[passKey(pass), { at: loc.at, corner: loc.corner }]])
  const m = findMoments(fx.inputs, located)
  const text = m.map((x) => `${x.lap} ${x.kind}: ${x.text}`)

  assert.equal(m[0].kind, 'start')
  assert.equal(m[0].text, 'Verstappen leads away from pole; Perez gains 2 places (P8 → P6)')
  // Norris hunted Verstappen for the lead for ten laps…
  assert.ok(text.includes('54 duel: Norris within a second of Verstappen for the lead, laps 54–63 (closest 0.5s, lap 63)'), text.join('\n'))
  // …until they collided on lap 64. The race's turning point: Verstappen and Norris collide and pit; Russell leads.
  assert.ok(text.includes('64 lead-change: Russell takes the lead as Verstappen pits'), text.join('\n'))
  assert.ok(text.includes("64 retirement: Norris's race ends on lap 64"), text.join('\n'))
  // The located pass carries an exact cue, seven seconds before the move.
  const p = m.find((x) => x.kind === 'pass' && x.lap === 65)!
  assert.equal(p.text, 'Piastri passes Sainz for P2 into Turn 6 (0.7s behind a lap earlier)')
  assert.equal(p.at, Math.round((loc.at - 7) * 10) / 10)
  assert.equal(p.focus, 'PIA')
  assert.ok(text.includes('66 safety-car: Virtual safety car, lap 66') || text.some((t) => t.startsWith('66 safety-car')), text.join('\n'))
  assert.ok(text.includes('70 fastest-lap: Alonso sets the fastest lap, 1:07.694'))
  assert.equal(m.at(-1)!.text, 'Russell wins by 1.906s from Piastri')
  // In race order.
  assert.deepEqual(m.map((x) => x.lap), [...m.map((x) => x.lap)].sort((a, b) => a - b))

  const md = replayMomentsMarkdown({ sessionKey: '2024_austrian_grand_prix_R', title: '2024 Austrian Grand Prix', laps: 71, moments: m })
  assert.ok(md.includes('data-session="2024_austrian_grand_prix_R" data-laps="71"'))
  assert.ok(md.includes(`\`data-at="${p.at}" data-cam="chase" data-focus="PIA"\``))
  assert.ok(md.includes('`data-lap="1" data-cam="heli" data-focus="VER"`'))
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePits, parseRaceControl, periodsFromScLaps, pitsFromTiming } from './raceControl'

const at = (min: number) => `2026-05-24T13:${String(min).padStart(2, '0')}:00+00:00`

test('safety car, VSC → SC upgrade, red flag and sector yellows become lap periods', () => {
  const periods = parseRaceControl([
    { date: at(5), lap_number: 3, category: 'Flag', flag: 'YELLOW', scope: 'Sector', sector: 7, message: 'YELLOW IN TRACK SECTOR 7' },
    { date: at(6), lap_number: 3, category: 'Flag', flag: 'CLEAR', scope: 'Sector', sector: 7, message: 'CLEAR IN TRACK SECTOR 7' },
    { date: at(20), lap_number: 12, category: 'SafetyCar', message: 'VIRTUAL SAFETY CAR DEPLOYED' },
    { date: at(21), lap_number: 13, category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' },
    // A yellow under the SC is redundant and dropped.
    { date: at(22), lap_number: 14, category: 'Flag', flag: 'DOUBLE YELLOW', scope: 'Sector', sector: 2 },
    { date: at(23), lap_number: 15, category: 'Flag', flag: 'CLEAR', scope: 'Sector', sector: 2 },
    { date: at(25), lap_number: 16, category: 'SafetyCar', message: 'SAFETY CAR IN THIS LAP' },
    { date: at(40), lap_number: 31, category: 'Flag', flag: 'RED', scope: 'Track', message: 'RED FLAG' },
    { date: at(55), lap_number: 31, category: 'Flag', flag: 'GREEN', scope: 'Track', message: 'GREEN LIGHT - PIT EXIT OPEN' },
    { date: at(59), lap_number: 50, category: 'Flag', flag: 'CHEQUERED', scope: 'Track' },
  ])
  assert.deepEqual(
    periods.map((p) => [p.kind, p.startLap, p.endLap]),
    [
      ['YELLOW', 3, 3],
      ['VSC', 12, 13],
      ['SC', 13, 16],
      ['RED', 31, 31],
    ],
  )
  assert.equal(periods.find((p) => p.kind === 'SC')?.message, 'SAFETY CAR DEPLOYED')
})

test('open periods close on the last lap seen; adjacent yellows merge', () => {
  const periods = parseRaceControl([
    { date: at(1), lap_number: 5, category: 'Flag', flag: 'YELLOW', sector: 1 },
    { date: at(2), lap_number: 5, category: 'Flag', flag: 'CLEAR', sector: 1 },
    { date: at(3), lap_number: 6, category: 'Flag', flag: 'YELLOW', sector: 4 },
    { date: at(4), lap_number: 6, category: 'Flag', flag: 'CLEAR', sector: 4 },
    { date: at(5), lap_number: 40, category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' },
    { date: at(6), lap_number: 42, category: 'Other', message: 'LAPPED CARS MAY NOW OVERTAKE' },
  ])
  assert.deepEqual(
    periods.map((p) => [p.kind, p.startLap, p.endLap]),
    [
      ['YELLOW', 5, 6],
      ['SC', 40, 42],
    ],
  )
})

test('pit rows: lane falls back to pit_duration, red-flag lane stays are dropped', () => {
  const stops = parsePits([
    { driver_number: 1, lap_number: 22, lane_duration: 21.94, stop_duration: 2.36 },
    { driver_number: 44, lap_number: 18, pit_duration: 23.1 },
    { driver_number: 16, lap_number: 31, lane_duration: 1500 },
  ])
  assert.deepEqual(stops, [
    { driverNumber: 44, lap: 18, laneSec: 23.1, stopSec: null },
    { driverNumber: 1, lap: 22, laneSec: 21.9, stopSec: 2.4 },
  ])
})

test('timing fallback merges consecutive SC laps and joins stint pit deltas', () => {
  assert.deepEqual(
    periodsFromScLaps([33, 31, 32, 40]).map((p) => [p.startLap, p.endLap]),
    [
      [31, 33],
      [40, 40],
    ],
  )
  const stops = pitsFromTiming(
    [{ driverNumber: 1, lap: 20 }],
    [
      { driverNumber: 1, pitInLap: 20, pitDeltaSec: 22.43 },
      { driverNumber: 4, pitInLap: 25, pitDeltaSec: null },
    ],
  )
  assert.deepEqual(stops, [
    { driverNumber: 1, lap: 20, laneSec: 22.4, stopSec: null },
    { driverNumber: 4, lap: 25, laneSec: null, stopSec: null },
  ])
})

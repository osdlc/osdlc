// vitest runs each test file in its own isolated worker, so pinning the zone here
// does not leak into the rest of the suite. A DST-observing zone is required:
// the day-of-year defect only shows between the spring-forward and fall-back
// transitions.
process.env.TZ = 'America/New_York'

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { formatDateMoment, formatRelative } from '../../src/expr/format-date.ts'

test('DDD/DDDD count whole calendar days, not 24-hour spans across a DST shift', () => {
  // 2025 springs forward on Mar 9, so Apr 1 sits one hour short of 90 * 24h
  // after Jan 1 midnight.
  assert.equal(formatDateMoment(new Date(2025, 3, 1), 'DDD'), '91')
  assert.equal(formatDateMoment(new Date(2025, 3, 1), 'DDDD'), '091')

  // Every day inside the DST window is affected, not just this one.
  assert.equal(formatDateMoment(new Date(2025, 2, 10), 'DDD'), '69')
  assert.equal(formatDateMoment(new Date(2025, 10, 1), 'DDD'), '305')
})

test('DDD is unchanged outside the DST window and at the year boundaries', () => {
  assert.equal(formatDateMoment(new Date(2025, 0, 1), 'DDD'), '1')
  assert.equal(formatDateMoment(new Date(2025, 1, 28), 'DDD'), '59')
  assert.equal(formatDateMoment(new Date(2025, 11, 31), 'DDD'), '365')
  // Leap year.
  assert.equal(formatDateMoment(new Date(2024, 11, 31), 'DDD'), '366')
})

test('DDD ignores time of day within the same calendar date', () => {
  assert.equal(formatDateMoment(new Date(2025, 3, 1, 0, 0), 'DDD'), '91')
  assert.equal(formatDateMoment(new Date(2025, 3, 1, 23, 59), 'DDD'), '91')
})

test('w/ww/gggg are the en locale week: Sunday start, the week holding Jan 1 is week 1', () => {
  // 2025-01-05 is a Sunday: the second en week, still ISO week 1.
  assert.equal(formatDateMoment(new Date(2025, 0, 5), 'w'), '2')
  assert.equal(formatDateMoment(new Date(2025, 0, 5), 'ww'), '02')
  assert.equal(formatDateMoment(new Date(2025, 0, 5), 'W'), '1')
  // 2024-12-29 (Sunday) starts the week holding 2025-01-01.
  assert.equal(formatDateMoment(new Date(2024, 11, 29), 'w gggg'), '1 2025')
  assert.equal(formatDateMoment(new Date(2024, 11, 29), 'W GGGG'), '52 2024')
  assert.equal(formatDateMoment(new Date(2024, 11, 28), 'w gggg'), '52 2024')
  // Mid-year, across the DST shift.
  assert.equal(formatDateMoment(new Date(2025, 6, 4), 'w'), '27')
  assert.equal(formatDateMoment(new Date(2025, 0, 1), 'w gggg'), '1 2025')
})

test('relative() of a date equal to now reads as the past, as Moment does', () => {
  const now = new Date(2026, 6, 5, 10, 0, 0)
  assert.equal(formatRelative(now, now), 'a few seconds ago')
})

test('relative() rounds the count before choosing its unit, as Moment does', () => {
  const now = new Date(2026, 6, 5, 10, 0, 0)
  const ago = (ms: number): string => formatRelative(new Date(now.getTime() - ms), now)
  const minute = 60000
  const hour = 60 * minute
  const day = 24 * hour
  assert.equal(ago(44.6 * minute), 'an hour ago')
  assert.equal(ago(44.4 * minute), '44 minutes ago')
  assert.equal(ago(21.6 * hour), 'a day ago')
  assert.equal(ago(21.4 * hour), '21 hours ago')
  assert.equal(ago(25.6 * day), 'a month ago')
  assert.equal(ago(25.4 * day), '25 days ago')
  assert.equal(ago(44.6 * 1000), 'a minute ago')
  assert.equal(ago(30 * 1000), 'a few seconds ago')
  assert.equal(ago(3 * day), '3 days ago')
  assert.equal(ago(100 * day), '3 months ago')
  assert.equal(ago(400 * day), 'a year ago')
  assert.equal(ago(800 * day), '2 years ago')
})

test('year, week and day-of-year tokens keep a year under 100 as written', () => {
  // 0050-06-01 is a Wednesday: locale week 23, ISO week 22, day 152. Moment
  // pads the four-digit year tokens.
  const d = new Date(2000, 0, 1)
  d.setFullYear(50, 5, 1)
  assert.equal(formatDateMoment(d, 'YYYY w gggg W GGGG DDD'), '0050 23 0050 22 0050 152')
  assert.equal(formatDateMoment(new Date(2025, 0, 5), 'YYYY w gggg'), '2025 2 2025')
})

test('w/ww/gggg are the en locale week (Sunday start, week 1 holds Jan 1); W/WW/GGGG stay ISO', () => {
  // 2025-01-05 is a Sunday: locale week 2, ISO week 1.
  assert.equal(formatDateMoment(new Date(2025, 0, 5), 'w ww W WW'), '2 02 1 01')
  // 2024-12-29 is a Sunday whose week holds 2025-01-01.
  assert.equal(formatDateMoment(new Date(2024, 11, 29), 'gggg w'), '2025 1')
  // 2027-01-01 is a Friday: locale week 1 of 2027, ISO week 53 of 2026.
  assert.equal(formatDateMoment(new Date(2027, 0, 1), 'gggg w GGGG W'), '2027 1 2026 53')
  // A Saturday closes its locale week.
  assert.equal(formatDateMoment(new Date(2025, 0, 4), 'w'), '1')
})

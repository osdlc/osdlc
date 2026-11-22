// vitest runs each test file in its own isolated worker, so pinning the zone here
// does not leak into the rest of the suite. A DST-observing zone is required:
// the calendar-vs-elapsed date arithmetic below only diverges across a
// transition.
process.env.TZ = 'America/New_York'

import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  DateValue,
  ErrorValue,
  LinkValue,
  addDuration,
  addValues,
  divideValues,
  fromFrontmatter,
  multiplyValues,
  parseDate,
  parseDuration,
  subtractValues,
  toDisplayString,
  toNumber,
} from '../../src/expr/values.ts'
import { formatDateMoment } from '../../src/expr/format-date.ts'

const stamp = (d: Date) => formatDateMoment(d, 'YYYY-MM-DD HH:mm')

test('a whole-day duration moves by calendar days, not by fixed 24-hour blocks', () => {
  // 2025-11-02 is 25 hours long in this zone; 2025-03-09 is 23.
  const fallBack = parseDate('2025-11-02')!
  assert.equal(stamp(addDuration(fallBack, parseDuration('1d')!, 1).date), '2025-11-03 00:00')

  const springForward = parseDate('2025-03-09')!
  assert.equal(stamp(addDuration(springForward, parseDuration('1d')!, 1).date), '2025-03-10 00:00')

  // And symmetrically going backwards.
  assert.equal(
    stamp(addDuration(parseDate('2025-11-03')!, parseDuration('1d')!, -1).date),
    '2025-11-02 00:00',
  )
  assert.equal(
    stamp(addDuration(parseDate('2025-03-10')!, parseDuration('1d')!, -1).date),
    '2025-03-09 00:00',
  )

  // A multi-day span crossing the transition lands on the calendar day too.
  assert.equal(
    stamp(addDuration(parseDate('2025-11-01')!, parseDuration('1w')!, 1).date),
    '2025-11-08 00:00',
  )
})

test('a sub-day duration still adds elapsed time, DST included', () => {
  // 01:00 EDT + 2h crosses the fall-back repeat of 01:00, landing at 02:00 EST.
  const start = parseDate('2025-11-02T00:30')!
  assert.equal(stamp(addDuration(start, parseDuration('2h')!, 1).date), '2025-11-02 01:30')
})

test('a duration mixing days and clock time applies each part in its own terms', () => {
  const start = parseDate('2025-11-01T12:00')!
  assert.equal(stamp(addDuration(start, parseDuration('1d 3h')!, 1).date), '2025-11-02 15:00')
})

test('a date-only value stays date-only while the sum still lands on midnight', () => {
  const dateOnly = parseDate('2025-01-01')!
  assert.equal(addDuration(dateOnly, parseDuration('1d')!, 1).hasTime, false)
  assert.equal(addDuration(dateOnly, parseDuration('24h')!, 1).hasTime, false)
  assert.equal(addDuration(dateOnly, parseDuration('2h')!, 1).hasTime, true)
})

test('addDuration does not mutate the date it was handed', () => {
  const start = parseDate('2025-11-02')!
  const before = start.date.getTime()
  addDuration(start, parseDuration('1d')!, 1)
  assert.equal(start.date.getTime(), before)
})

test('parseDate rejects out-of-range components instead of rolling them over', () => {
  assert.equal(parseDate('2025-02-30'), null)
  assert.equal(parseDate('1999-06-31'), null)
  assert.equal(parseDate('2025-13-45'), null)
  assert.equal(parseDate('2025-00-10'), null)
  assert.equal(parseDate('2025-01-00'), null)
  assert.equal(parseDate('2025-01-01T25:99'), null)
  assert.equal(parseDate('2025-01-01T12:60'), null)
  // The zone-qualified branch normalizes day overflow the same way.
  assert.equal(parseDate('2025-02-30T00:00Z'), null)
})

test('parseDate still accepts every real calendar date, leap days included', () => {
  assert.equal(stamp(parseDate('2024-02-29')!.date), '2024-02-29 00:00')
  assert.equal(parseDate('2025-02-29'), null)
  assert.equal(stamp(parseDate('2000-02-29')!.date), '2000-02-29 00:00')
  assert.equal(parseDate('1900-02-29'), null)
  assert.equal(stamp(parseDate('2025-01-31')!.date), '2025-01-31 00:00')
  assert.equal(stamp(parseDate('2025-04-30')!.date), '2025-04-30 00:00')
  assert.equal(stamp(parseDate('2025-12-31T23:59:59')!.date), '2025-12-31 23:59')
})

test('parseDate keeps treating the ISO leap second as the next minute', () => {
  // Pre-existing leniency in the zone-less branch; range checking must not
  // silently turn these strings back into plain strings.
  assert.equal(stamp(parseDate('2025-01-01T23:59:60')!.date), '2025-01-02 00:00')
})

test('parseDuration rejects units that only exist on Object.prototype', () => {
  // DURATION_SEGMENT_RE captures the unit as [A-Za-z]+, which matches inherited
  // member names; an unguarded index lookup finds them and yields NaN.
  for (const unit of ['toString', 'valueOf', 'constructor', 'hasOwnProperty', 'isPrototypeOf']) {
    assert.equal(parseDuration(`1${unit}`), null, `1${unit} is not a duration`)
  }
  assert.equal(parseDuration('1zz'), null)
})

test('parseDuration still resolves every real unit, case-insensitively', () => {
  assert.equal(parseDuration('1d')!.ms, 86400000)
  assert.equal(parseDuration('1D')!.ms, 86400000)
  assert.equal(parseDuration('2 weeks')!.ms, 2 * 7 * 86400000)
  assert.equal(parseDuration('90s')!.ms, 90000)
  assert.equal(parseDuration('5ms')!.ms, 5)
  assert.equal(parseDuration('1M')!.months, 1)
  assert.equal(parseDuration('1y 2M 3d')!.months, 14)
})

test('parseDate keeps years 0000-0099 instead of mapping them to 19xx', () => {
  assert.equal(toDisplayString(parseDate('0050-06-01')), '0050-06-01')
  assert.equal(parseDate('0001-01-01')!.date.getFullYear(), 1)
  assert.equal(parseDate('0050-06-01T10:00')!.date.getFullYear(), 50)
  assert.equal(parseDate('0050-06-01T10:00Z')!.date.getUTCFullYear(), 50)
  // Year 0 is a leap year; validation and construction must agree on it.
  assert.equal(toDisplayString(parseDate('0000-02-29')), '0000-02-29')
  // Still a real date in the right century: sorts before 1950.
  assert.ok(parseDate('0050-06-01')!.ms < parseDate('1950-06-01')!.ms)
})

test('parseDate reads the ISO leap second in a zoned string, as it does without a zone', () => {
  const zoned = parseDate('2016-12-31T23:59:60Z')
  assert.ok(zoned, 'a zoned leap second is a date')
  assert.equal(zoned.date.toISOString(), '2017-01-01T00:00:00.000Z')
  assert.equal(
    parseDate('2016-12-31T23:59:60.500+00:00')!.date.toISOString(),
    '2017-01-01T00:00:00.500Z',
  )
  assert.equal(stamp(parseDate('2016-12-31T23:59:60')!.date), '2017-01-01 00:00')
})

test('fromFrontmatter turns a self-referential YAML alias into a value, not a stack overflow', () => {
  const m: Record<string, unknown> = {}
  m['self'] = m
  const value = fromFrontmatter({ m }, () => null) as Record<string, unknown>
  assert.deepEqual(value, { m: { self: null } })
  // A value shared by two keys (an alias that is not a cycle) converts at both.
  const shared = { a: 1 }
  assert.deepEqual(
    fromFrontmatter({ x: shared, y: shared }, () => null),
    {
      x: { a: 1 },
      y: { a: 1 },
    },
  )
})

test('a fractional month adds to a date as the days totalMs counts it as', () => {
  const half = divideValues(parseDuration('1M')!, 2)
  const added = addValues(parseDate('2025-01-15')!, half) as DateValue
  assert.equal(stamp(added.date), '2025-01-30 00:00')
  assert.equal(added.hasTime, false)
  const oneAndHalf = addValues(parseDate('2025-03-31')!, parseDuration('1.5M')!) as DateValue
  assert.equal(stamp(oneAndHalf.date), '2025-05-15 00:00')
})

test('an hour-based duration adds elapsed hours, even past 24 and across DST', () => {
  // 2025-03-09 springs forward: 36 elapsed hours from noon on the 8th is 01:00 on the 10th.
  const start = parseDate('2025-03-08T12:00')!
  assert.equal(stamp(addDuration(start, parseDuration('36h')!, 1).date), '2025-03-10 01:00')
  assert.equal(stamp(addDuration(start, parseDuration('1440m')!, 1).date), '2025-03-09 13:00')
  // Day units still move the calendar.
  assert.equal(stamp(addDuration(start, parseDuration('1d 12h')!, 1).date), '2025-03-10 00:00')
})

test('adding a date difference back returns the date it was taken from', () => {
  const from = parseDate('2025-03-01')!
  const due = parseDate('2025-03-30')!
  const back = addValues(from, subtractValues(due, from)) as DateValue
  assert.equal(back.ms, due.ms)
  assert.equal(toDisplayString(back), '2025-03-30')
})

test('formatDuration rounds away floating-point residue', () => {
  assert.equal(toDisplayString(parseDuration('1.1h')), '1 hour, 6 minutes')
  assert.equal(toDisplayString(parseDuration('2.3d')), '2 days, 7 hours, 12 minutes')
  assert.equal(
    toDisplayString(multiplyValues(parseDuration('1d')!, 1.1)),
    '1 day, 2 hours, 24 minutes',
  )
  assert.equal(
    toDisplayString(divideValues(parseDuration('1h')!, 7)),
    '8 minutes, 34 seconds, 286 ms',
  )
  assert.equal(toDisplayString(parseDuration('5ms')), '5 ms')
})

test('toDisplayString on an object shows nested values by their display strings', () => {
  const resolve = (target: string) => (target === 'Foo' ? 'Foo.md' : null)
  const meta = fromFrontmatter({ due: '2025-01-01', ref: '[[Foo]]', n: 1, tags: ['a'] }, resolve)
  assert.equal(toDisplayString(meta), '{"due":"2025-01-01","ref":"Foo","n":1,"tags":["a"]}')
  assert.equal(
    toDisplayString({ link: new LinkValue('X', 'Shown', false, null), err: new ErrorValue('bad') }),
    '{"link":"Shown","err":"Error: bad"}',
  )
})

test('toNumber rejects blank strings instead of reading them as 0', () => {
  assert.throws(() => toNumber(''), /Cannot convert/)
  assert.throws(() => toNumber('   '), /Cannot convert/)
  assert.equal(toNumber(' 42 '), 42)
  assert.equal(toNumber('0'), 0)
})

test('a zoned leap second (:60) folds into the next minute like a local one does', () => {
  assert.equal(parseDate('2016-12-31T23:59:60Z')?.date.getTime(), Date.UTC(2017, 0, 1))
  assert.equal(
    parseDate('2016-12-31T23:59:60.500+00:00')?.date.getTime(),
    Date.UTC(2017, 0, 1, 0, 0, 0, 500),
  )
  assert.equal(
    parseDate('2016-12-31T23:59:60')?.date.getTime(),
    new Date(2017, 0, 1, 0, 0, 0).getTime(),
  )
})

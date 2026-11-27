// vitest runs each test file in its own isolated worker, so pinning the zone here
// does not leak into the rest of the suite. Chile springs forward at midnight:
// 2025-09-07 00:00 does not exist and that day starts at 01:00.
process.env.TZ = 'America/Santiago'

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { addDuration, parseDate, parseDuration, toDisplayString } from '../../src/expr/values.ts'

test('a date-only value plus whole days stays date-only on a day that starts at 01:00', () => {
  const sum = addDuration(parseDate('2025-09-06')!, parseDuration('1d')!, 1)
  assert.equal(sum.hasTime, false)
  assert.equal(toDisplayString(sum), '2025-09-07')
  // The same day parsed directly sits at 01:00 too, so the two are equal.
  assert.equal(sum.ms, parseDate('2025-09-07')!.ms)
})

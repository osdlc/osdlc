// @vitest-environment jsdom
// Stories: a seeded PRNG for fixture data, and the metrics hook a perf story
// calls once in its setup. In a real story these run in the Storybook iframe.
import { expect, test } from 'vitest'

import {
  FIRST_ROWS_MARK,
  MARK_PREFIX,
  MOUNT_MARK,
  seeded,
  storyMetrics,
  type StoryHarness,
} from '@osdlc/story-harness/browser'

test('seeded gives the same fixture on every run', () => {
  const random = seeded(42)
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: i, size: Math.floor(random() * 1000) }))
  const again = seeded(42)
  expect(rows.map((r) => r.size)).toEqual([0, 1, 2].map(() => Math.floor(again() * 1000)))
})

test('storyMetrics marks mount and the first painted rows', async () => {
  document.body.innerHTML = '<ul><li data-row></li><li data-row></li></ul>'
  const harness: StoryHarness = storyMetrics({ rows: '[data-row]' })
  expect(window.__storyHarness).toBe(harness)
  expect(harness.rows()).toBe(2)
  await harness.ready
  const names = harness.marks().map((m) => m.name)
  expect(names).toEqual([MOUNT_MARK, FIRST_ROWS_MARK])
  expect(names.every((n) => n.startsWith(MARK_PREFIX))).toBe(true)
})

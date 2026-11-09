/**
 * One paragraph of unclosed destinations. Matching each `(` by scanning
 * forward made this quadratic: tens of seconds at the largest size. A linear
 * pass takes well under a second, even on a loaded machine. The bound is that
 * wide on purpose: it catches the shape of the cost, not a slowdown.
 */
import { expect, test } from 'vitest'
import { inlineTags } from '../src/index.ts'

const SIZES = [25_000, 50_000, 100_000]
const BOUND_MS = 10_000

test('link blanking is linear in unclosed destinations', () => {
  for (const n of SIZES) {
    for (const [body, count] of [
      ['[a]('.repeat(n), 0],
      ['[a](#x '.repeat(n), n],
    ] as const) {
      const started = performance.now()
      const tags = inlineTags(body, 'obsidian')
      const elapsed = performance.now() - started
      expect(tags).toHaveLength(count)
      expect(elapsed).toBeLessThan(BOUND_MS)
    }
  }
}, 600_000)

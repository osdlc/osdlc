/**
 * Inputs that made an earlier scan quadratic. A quadratic pass takes tens of
 * seconds on the largest size; a linear one takes well under a second, even
 * on a loaded machine. The bound is that wide on purpose: it catches the shape
 * of the cost, not a slowdown.
 */
import { expect, test } from 'vitest'
import { bodyLinksSpanned, parseInner } from '../src/index.ts'

const SIZES = [25_000, 50_000, 100_000]
const BOUND_MS = 10_000

function timed(run: () => void): number {
  const started = performance.now()
  run()
  return performance.now() - started
}

test('parseInner is linear in whitespace runs', () => {
  for (const n of SIZES) {
    const spaces = ' '.repeat(n)
    const inner = `${spaces}a${spaces}a${spaces}#h${spaces}h|b${spaces}b${spaces}`
    const elapsed = timed(() => expect(parseInner(inner, false)?.target).toBe(`a${spaces}a`))
    expect(elapsed).toBeLessThan(BOUND_MS)
  }
}, 120_000)

test('bodyLinksSpanned is linear in link attempts, failed or not', () => {
  for (const n of SIZES) {
    const spaces = ' '.repeat(n)
    for (const [body, links] of [
      ['[](a'.repeat(n), 0],
      [`${'[](a'.repeat(n)})`, 0],
      [`${'[](a:'.repeat(n)}.md)`, 0],
      [`${'[](a/'.repeat(n)}.x)`, 0],
      [`[[${spaces}x${spaces}x${spaces}]]`, 1],
      ['[[a]] '.repeat(n), n],
    ] as const) {
      const elapsed = timed(() => expect(bodyLinksSpanned(body)).toHaveLength(links))
      expect(elapsed).toBeLessThan(BOUND_MS)
    }
  }
}, 600_000)

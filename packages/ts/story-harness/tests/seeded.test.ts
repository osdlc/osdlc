import { describe, expect, it } from 'vitest'
import { seeded } from '../src/browser/index.ts'

const take = (next: () => number, n: number) => Array.from({ length: n }, next)

describe('seeded', () => {
  it('yields the same first 1,000 values for the same seed', () => {
    const a = take(seeded(42), 1000)
    expect(take(seeded(42), 1000)).toEqual(a)
  })

  it('yields values in [0, 1)', () => {
    for (const v of take(seeded(42), 1000)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('yields different sequences for different seeds', () => {
    expect(take(seeded(42), 10)).not.toEqual(take(seeded(43), 10))
  })

  it('is pinned, so a fixture built from it never moves', () => {
    expect(take(seeded(42), 3).map((v) => v.toFixed(6))).toMatchSnapshot()
  })
})

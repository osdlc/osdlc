import { describe, expect, test } from 'vitest'
import {
  ALL_ASPECTS,
  EVIDENCE_TIERS,
  hasAspect,
  strongestTier,
  type Aspect,
} from '../src/aspect.ts'

const aspect = (id: string, tier: number): Aspect => ({
  id,
  tier,
  evidence: [{ kind: 'manifest', tier, source: 'package.json#main', found: 'index.ts' }],
})

describe('aspects', () => {
  test('evidence tiers run from the most direct kind to the most expensive', () => {
    expect(EVIDENCE_TIERS).toEqual({ manifest: 1, dependency: 2, files: 3, content: 4 })
  })

  test('the roster lists every aspect once', () => {
    expect(new Set(ALL_ASPECTS).size).toBe(ALL_ASPECTS.length)
    expect(ALL_ASPECTS).toContain('typescript')
  })

  test('strongestTier is the minimum tier, or null for no aspects', () => {
    expect(strongestTier([])).toBeNull()
    expect(strongestTier([aspect('vue', 2), aspect('typescript', 1), aspect('test', 4)])).toBe(1)
  })

  test('hasAspect matches by id at any tier', () => {
    const aspects = [aspect('vue', 2), aspect('test', 4)]
    expect(hasAspect(aspects, 'test')).toBe(true)
    expect(hasAspect(aspects, 'rust')).toBe(false)
  })
})

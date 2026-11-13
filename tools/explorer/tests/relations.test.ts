import { describe, expect, it } from 'vitest'
import { isOverlap, overlapLabel, overlapsInView, relationOf } from '../src/model/relations'
import type { EdgeKind } from '../src/model/types'
import { fixture } from './fixture'

describe('relationOf', () => {
  it('puts every edge kind in one relation', () => {
    const kinds: EdgeKind[] = ['depends', 'dev-depends', 'implements', 'extends', 'validates', 'reads', 'twin', 'overlaps']
    expect(Object.fromEntries(kinds.map((kind) => [kind, relationOf(kind)]))).toEqual({
      depends: 'dependencies',
      'dev-depends': 'dependencies',
      implements: 'structure',
      extends: 'structure',
      validates: 'structure',
      reads: 'structure',
      twin: 'twins',
      overlaps: 'overlaps',
    })
    expect(new Set(kinds.map(relationOf))).toEqual(new Set(['dependencies', 'structure', 'twins', 'overlaps']))
  })
})

describe('overlaps', () => {
  it('tells overlap edges from the rest', () => {
    expect(isOverlap({ kind: 'overlaps' })).toBe(true)
    expect(isOverlap({ kind: 'twin' })).toBe(false)
  })

  it('labels copies and partial overlaps', () => {
    const edge = { from: 'a', to: 'b', kind: 'overlaps' as const, states: [] }
    expect(overlapLabel({ ...edge, overlap: 'copy' })).toBe('≈ copy')
    expect(overlapLabel({ ...edge, overlap: 'partial' })).toBe('≈ overlap')
  })

  it('counts the overlaps in each view', () => {
    expect(overlapsInView(fixture, 'compare')).toHaveLength(2)
    expect(overlapsInView(fixture, 'present')).toHaveLength(2)
    expect(overlapsInView(fixture, 'target')).toHaveLength(0)
  })
})

// Runs the README "Worked example" through the package name, the way a consumer imports it.
import { expect, test } from 'vitest'
import { decode, encode } from '@osdlc/spec-query'

const DEFAULT_SPEC = {
  scope: null,
  containment: 'nested',
  facets: { kinds: [], query: '', searchMode: 'highlight' },
  prune: { hideIsolated: false, minFanIn: 0, transitiveReduction: false },
  edges: { markCycles: true },
}

test('a default view encodes to the empty string', () => {
  expect(encode(DEFAULT_SPEC, DEFAULT_SPEC)).toBe('')
})

test('the README view encodes to the documented URL and decodes back', () => {
  const view = {
    ...DEFAULT_SPEC,
    containment: 'matrix',
    facets: { kinds: ['package'], query: 'vault,graph', searchMode: 'highlight' },
    prune: { hideIsolated: false, minFanIn: 3, transitiveReduction: true },
    edges: { markCycles: false },
  }
  const query = encode(view, DEFAULT_SPEC)
  expect(query).toBe(
    'containment=matrix&facets.kinds=package&facets.query=vault%2Cgraph' +
      '&prune.minFanIn=3&prune.transitiveReduction=1&edges.markCycles=0',
  )
  expect(decode(query, DEFAULT_SPEC)).toEqual(view)
})

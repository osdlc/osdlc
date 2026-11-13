import { describe, expect, it } from 'vitest'
import { nodeIdFromHash } from '../src/composables/useSelection'
import { groupTwins } from '../src/model/twins'
import { fixture } from './fixture'

const graph = groupTwins(fixture)

describe('nodeIdFromHash', () => {
  it('reads a node id from #node=<id>', () => {
    expect(nodeIdFromHash('#node=markdown-link', graph)).toBe('markdown-link')
  })

  it('selects the twin card from either member id', () => {
    expect(nodeIdFromHash('#node=markdown-link-rs', graph)).toBe('markdown-link')
    expect(nodeIdFromHash('#node=markdown-corpus', graph)).toBe('markdown-corpus-ts')
  })

  it('ignores other hashes and unknown ids', () => {
    expect(nodeIdFromHash('', graph)).toBeNull()
    expect(nodeIdFromHash('#markdown-link', graph)).toBeNull()
    expect(nodeIdFromHash('#node=nope', graph)).toBeNull()
  })
})

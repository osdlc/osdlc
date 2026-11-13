import { describe, expect, it } from 'vitest'
import { cardsForTask, planTaskRefs, sourceUrl } from '../src/model/crossLinks'
import { groupTwins } from '../src/model/twins'
import { fixture } from './fixture'
import { index } from './planFixture'

describe('cardsForTask', () => {
  it('maps a task to the cards that list it, twin members to their merged card', () => {
    const graph = groupTwins({
      ...fixture,
      nodes: fixture.nodes.map((n) => (n.id === 'markdown-link-rs' ? { ...n, tasks: [99] } : n)),
    })
    expect(cardsForTask(graph, 99).map((c) => c.id)).toEqual(['markdown-link'])
    expect(cardsForTask(graph, 12345)).toEqual([])
  })
})

describe('planTaskRefs', () => {
  it('pairs each number with its plan task, or null', () => {
    expect(planTaskRefs([2, 77], index.task).map((r) => [r.id, r.task?.title ?? null])).toEqual([
      [2, 'Two'],
      [77, null],
    ])
  })
})

describe('sourceUrl', () => {
  it('points at the record on GitHub', () => {
    expect(sourceUrl('docs/plan/4.md')).toBe('https://github.com/osdlc/osdlc/blob/main/docs/plan/4.md')
    expect(sourceUrl(null)).toBeNull()
  })
})

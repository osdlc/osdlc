import { describe, expect, it } from 'vitest'
import { milestoneDeps } from '../src/model/work'
import { emptyWorkFilters, hasWorkFilters, visibleWork, workFacets } from '../src/model/workFilters'
import { taskEdgeId, toWorkFlow, workHeading, type WorkFlowInput } from '../src/model/workFlow'
import { detailLayout, milestoneNodeId, overviewLayout, taskNodeId } from '../src/model/workLayout'
import { index } from './planFixture'

const deps = milestoneDeps(index)

function input(overrides: Partial<WorkFlowInput> = {}): WorkFlowInput {
  return {
    index,
    deps,
    layout: detailLayout(index),
    level: 'detail',
    visible: visibleWork(index, emptyWorkFilters()),
    selection: null,
    highlightNext: false,
    ...overrides,
  }
}

describe('filters', () => {
  it('show everything by default', () => {
    const visible = visibleWork(index, emptyWorkFilters())
    expect(visible.tasks.size).toBe(5)
    expect(hasWorkFilters(emptyWorkFilters())).toBe(false)
  })

  it('narrow by status, milestone and type, and drop milestones left empty', () => {
    const filters = { ...emptyWorkFilters(), types: ['functional' as const], statuses: ['owner' as const, 'todo' as const] }
    const visible = visibleWork(index, filters)
    expect([...visible.tasks].sort()).toEqual([3, 5])
    expect(hasWorkFilters(filters)).toBe(true)
    const onlyA = visibleWork(index, { ...emptyWorkFilters(), milestones: ['m-a'] })
    expect([...onlyA.milestones]).toEqual(['m-a'])
  })

  it('narrow by the phase of each task milestone', () => {
    const filters = { ...emptyWorkFilters(), phases: ['store' as const] }
    expect(hasWorkFilters(filters)).toBe(true)
    const visible = visibleWork(index, filters)
    expect([...visible.tasks].sort()).toEqual([1, 2, 3])
    expect([...visible.milestones]).toEqual(['m-b'])
    expect(visibleWork(index, { ...emptyWorkFilters(), phases: ['harness'] }).tasks.size).toBe(0)
  })

  it('count tasks per facet', () => {
    const facets = workFacets(index)
    expect(facets.statuses.find((f) => f.value === 'todo')!.count).toBe(2)
    expect(facets.milestones).toEqual([{ value: 'm-a', count: 2 }, { value: 'm-b', count: 3 }])
    expect(facets.types).toEqual([{ value: 'functional', count: 4 }, { value: 'supporting', count: 1 }])
    expect(facets.phases).toEqual([
      { value: 'store', count: 3 },
      { value: 'model', count: 2 },
      { value: 'harness', count: 0 },
    ])
  })
})

describe('toWorkFlow, detailed level', () => {
  it('draws each lane header then its tasks, and one edge per after link', () => {
    const flow = toWorkFlow(input())
    expect(flow.nodes.map((n) => n.id)).toEqual([
      milestoneNodeId('m-a'),
      taskNodeId(5),
      taskNodeId(4),
      milestoneNodeId('m-b'),
      taskNodeId(1),
      taskNodeId(2),
      taskNodeId(3),
    ])
    expect(flow.edges).toHaveLength(4)
    expect(flow.edges.find((e) => e.id === taskEdgeId(1, 2))!.satisfied).toBe(true)
  })

  it('arcs a link that skips over a card in its own row', () => {
    // 1 -> 3 skips 2, which sits between them in the same row.
    const flow = toWorkFlow(input())
    expect(flow.edges.find((e) => e.id === taskEdgeId(1, 3))!.arc).toBe(true)
    expect(flow.edges.find((e) => e.id === taskEdgeId(2, 3))!.arc).toBe(false)
  })

  it('focuses a selected task with what it waits on and unblocks', () => {
    const flow = toWorkFlow(input({ selection: { type: 'task', id: 3 } }))
    const dimmed = flow.nodes.filter((n) => n.data.dimmed).map((n) => n.id)
    // Task 3's own lane header stays bright; m-a's dims, though task 4 in it does not.
    expect(dimmed).toEqual([milestoneNodeId('m-a'), taskNodeId(5)])
    expect(flow.nodes.find((n) => n.id === taskNodeId(3))!.data.selected).toBe(true)
  })

  it('dims all but next-up tasks when the highlight is on', () => {
    const flow = toWorkFlow(input({ highlightNext: true }))
    const highlighted = flow.nodes.filter((n) => n.data.kind === 'task' && n.data.highlighted).map((n) => n.id)
    expect(highlighted).toEqual([taskNodeId(5), taskNodeId(2)])
    expect(flow.nodes.find((n) => n.id === taskNodeId(1))!.data.dimmed).toBe(true)
  })

  it('leaves out hidden tasks and their edges', () => {
    const visible = visibleWork(index, { ...emptyWorkFilters(), types: ['functional'] })
    const flow = toWorkFlow(input({ visible }))
    expect(flow.nodes.some((n) => n.id === taskNodeId(4))).toBe(false)
    expect(flow.edges.some((e) => e.target === taskNodeId(4))).toBe(false)
  })
})

describe('toWorkFlow, overview', () => {
  it('draws milestone cards with progress and milestone arrows', () => {
    const flow = toWorkFlow(input({ level: 'overview', layout: overviewLayout(index, deps) }))
    expect(flow.nodes.map((n) => n.id)).toEqual([milestoneNodeId('m-b'), milestoneNodeId('m-a')])
    const b = flow.nodes[0]!.data
    expect(b.kind === 'milestone' && b.progress).toEqual({ done: 1, total: 3 })
    expect(b.kind === 'milestone' && b.phaseLabel).toBe('Store')
    expect(flow.edges.map((e) => [e.source, e.target, e.satisfied])).toEqual([
      [milestoneNodeId('m-b'), milestoneNodeId('m-a'), false],
    ])
  })
})

describe('workHeading', () => {
  it('names the selected task or milestone', () => {
    expect(workHeading(index, { type: 'task', id: 3 })).toBe('3. Three')
    expect(workHeading(index, { type: 'milestone', id: 'm-a' })).toBe('A first')
    expect(workHeading(index, null)).toBe('Details')
  })
})

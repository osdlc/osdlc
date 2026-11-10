import { describe, expect, it } from 'vitest'
import { milestoneDeps } from '../src/model/work'
import {
  TASK_HEIGHT,
  depths,
  detailLayout,
  milestoneNodeId,
  overviewLayout,
  parseWorkNodeId,
  taskColumns,
  taskNodeId,
} from '../src/model/workLayout'
import { index } from './planFixture'

describe('depths', () => {
  it('is the longest prerequisite chain, and ends on a cycle', () => {
    const after: Record<string, string[]> = { a: [], b: ['a'], c: ['a', 'b'], d: ['d', 'e'], e: ['d'] }
    const result = depths(Object.keys(after), (k) => after[k]!)
    expect(result.get('a')).toBe(0)
    expect(result.get('c')).toBe(2)
    expect(result.has('d')).toBe(true)
  })
})

describe('detailLayout', () => {
  const layout = detailLayout(index)
  const at = (id: number) => layout.positions[taskNodeId(id)]!

  it('puts every task right of the tasks it waits on', () => {
    const columns = taskColumns(index)
    expect([1, 2, 3, 4, 5].map((id) => columns.get(id))).toEqual([0, 1, 2, 3, 0])
    for (const task of index.plan.tasks) {
      for (const before of task.after) expect(at(before).x).toBeLessThan(at(task.id).x)
    }
  })

  it('gives each milestone a lane in plan order, its tasks and header inside it', () => {
    expect(layout.lanes.map((l) => l.id)).toEqual(['m-a', 'm-b'])
    for (const lane of layout.lanes) {
      for (const task of index.tasksOf.get(lane.id)!) {
        expect(at(task.id).y).toBeGreaterThanOrEqual(lane.y)
        expect(at(task.id).y + TASK_HEIGHT).toBeLessThanOrEqual(lane.y + lane.height)
      }
      expect(layout.positions[milestoneNodeId(lane.id)]!.x).toBeLessThan(0)
    }
    expect(layout.lanes[1]!.y).toBe(layout.lanes[0]!.y + layout.lanes[0]!.height)
  })
})

describe('overviewLayout', () => {
  it('puts a milestone right of the ones it waits on', () => {
    const layout = overviewLayout(index, milestoneDeps(index))
    expect(layout.positions[milestoneNodeId('m-b')]!.x).toBeLessThan(layout.positions[milestoneNodeId('m-a')]!.x)
  })
})

describe('node ids', () => {
  it('round-trips task and milestone ids', () => {
    expect(parseWorkNodeId(taskNodeId(27))).toEqual({ type: 'task', id: 27 })
    expect(parseWorkNodeId(milestoneNodeId('m-npm'))).toEqual({ type: 'milestone', id: 'm-npm' })
    expect(parseWorkNodeId('other')).toBeNull()
  })
})

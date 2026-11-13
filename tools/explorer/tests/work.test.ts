import { describe, expect, it } from 'vitest'
import {
  groupByStatus,
  milestoneDeps,
  milestoneNeighbours,
  nextUpIds,
  progressOf,
  progressText,
  unblocksOf,
  waitsOn,
} from '../src/model/work'
import { index } from './planFixture'

const ids = (tasks: { id: number }[]) => tasks.map((t) => t.id)

describe('dependency lists', () => {
  it('lists what a task waits on and what it unblocks', () => {
    expect(ids(waitsOn(index, 3))).toEqual([1, 2])
    expect(ids(unblocksOf(index, 1))).toEqual([2, 3])
    expect(ids(unblocksOf(index, 4))).toEqual([])
  })

  it('orders a milestone tasks by its own list', () => {
    expect(ids(index.tasksOf.get('m-b')!)).toEqual([1, 2, 3])
  })
})

describe('next up', () => {
  it('is every task not done whose prerequisites are all done', () => {
    // 2 waits on done 1; 5 waits on nothing; 3 waits on 2 (doing); 4 waits on 3.
    expect([...nextUpIds(index)].sort()).toEqual([2, 5])
  })
})

describe('progress', () => {
  it('counts done tasks', () => {
    const progress = progressOf(index.tasksOf.get('m-b')!)
    expect(progress).toEqual({ done: 1, total: 3 })
    expect(progressText(progress)).toBe('1 of 3 done')
  })

  it('groups tasks by status, waiting work first', () => {
    const groups = groupByStatus(index, index.plan.tasks)
    expect(groups.map((g) => [g.status, g.label, ids(g.tasks)])).toEqual([
      ['doing', 'in progress', [2]],
      ['owner', 'waiting on owner', [4]],
      ['todo', 'not started', [3, 5]],
      ['done', 'done', [1]],
    ])
  })
})

describe('milestoneDeps', () => {
  it('derives a milestone link from task links that cross milestones', () => {
    const deps = milestoneDeps(index)
    expect(deps).toEqual([{ from: 'm-b', to: 'm-a', links: [{ from: 3, to: 4 }] }])
    expect(milestoneNeighbours(deps, 'm-a').waitsOn.map((d) => d.from)).toEqual(['m-b'])
    expect(milestoneNeighbours(deps, 'm-b').waitedOnBy.map((d) => d.to)).toEqual(['m-a'])
  })
})

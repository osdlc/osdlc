import { describe, expect, it } from 'vitest'
import { findCycle, parsePlan } from '../src/model/plan'
import { rawPlan } from './planFixture'

function withTasks(tasks: unknown[], milestones: unknown[] = rawPlan.milestones) {
  return parsePlan({ ...rawPlan, tasks, milestones })
}

describe('parsePlan', () => {
  it('reads the fixture without problems', () => {
    const { plan, problems } = parsePlan(rawPlan)
    expect(problems).toEqual([])
    expect(plan.tasks).toHaveLength(5)
    expect(plan.milestones.map((m) => m.id)).toEqual(['m-a', 'm-b'])
    expect(plan.milestones[1]!.source).toBe('docs/plan/m-b.md')
    expect(plan.tasks[0]!.source).toBeNull()
  })

  it('reports and drops an unknown task in after', () => {
    const tasks = rawPlan.tasks.map((t) => (t.id === 2 ? { ...t, after: [1, 99] } : t))
    const { plan, problems } = withTasks(tasks)
    expect(problems).toEqual(['Task 2 waits on unknown task 99; that link is dropped.'])
    expect(plan.tasks.find((t) => t.id === 2)!.after).toEqual([1])
  })

  it('reports and drops an unknown task in a milestone list', () => {
    const milestones = [{ ...rawPlan.milestones[0]!, tasks: [4, 5, 42] }, rawPlan.milestones[1]!]
    const { plan, problems } = withTasks(rawPlan.tasks, milestones)
    expect(problems).toEqual(['Milestone "m-a" lists unknown task 42; it is dropped.'])
    expect(plan.milestones[0]!.tasks).toEqual([4, 5])
  })

  it('reports a task listed in two milestones', () => {
    const milestones = [{ ...rawPlan.milestones[0]!, tasks: [4, 5, 3] }, rawPlan.milestones[1]!]
    expect(withTasks(rawPlan.tasks, milestones).problems).toContain(
      'Task 3 is listed in two milestones: "m-a" and "m-b".',
    )
  })

  it('reports a missing or unknown milestone', () => {
    const tasks = rawPlan.tasks.map((t) => (t.id === 5 ? { ...t, milestone: undefined } : t.id === 4 ? { ...t, milestone: 'm-x' } : t))
    const { problems } = withTasks(tasks)
    expect(problems).toContain('Task 5 has no milestone.')
    expect(problems).toContain('Task 4 names unknown milestone "m-x".')
  })

  it('reports a task its milestone does not list, or that another milestone lists', () => {
    const milestones = [{ ...rawPlan.milestones[0]!, tasks: [5] }, { ...rawPlan.milestones[1]!, tasks: [1, 2, 3, 4] }]
    expect(withTasks(rawPlan.tasks, milestones).problems).toEqual(['Task 4 says milestone "m-a" but "m-b" lists it.'])
    const unlisted = [{ ...rawPlan.milestones[0]!, tasks: [5] }, rawPlan.milestones[1]!]
    expect(withTasks(rawPlan.tasks, unlisted).problems).toEqual(['Task 4 is in "m-a" but that milestone does not list it.'])
  })

  it('reports unknown statuses, types, duplicate ids, self links and cycles', () => {
    const tasks = [
      ...rawPlan.tasks.map((t) => (t.id === 1 ? { ...t, after: [1, 3] } : t)),
      { ...rawPlan.tasks[4]!, status: 'later', type: 'other' },
    ]
    const { plan, problems } = withTasks(tasks)
    expect(problems).toContain('Task 1 waits on itself; that link is dropped.')
    expect(problems).toContain('Task id 5 is used twice; the first one is kept.')
    expect(problems.some((p) => p.startsWith('The after links go round in a circle'))).toBe(true)
    expect(plan.tasks.find((t) => t.id === 1)!.after).toEqual([3])
    const odd = parsePlan({ ...rawPlan, tasks: [{ ...rawPlan.tasks[4]!, status: 'later', type: 'other' }], milestones: [{ ...rawPlan.milestones[0]!, tasks: [5] }] })
    expect(odd.problems).toContain('Task 5 has unknown status "later".')
    expect(odd.problems).toContain('Task 5 has unknown type "other".')
    expect(odd.plan.tasks[0]).toMatchObject({ status: 'todo', type: 'functional' })
  })

  it('returns an empty plan for something that is not an object', () => {
    const { plan, problems } = parsePlan([])
    expect(plan.tasks).toEqual([])
    expect(problems).toHaveLength(1)
  })
})

describe('findCycle', () => {
  it('finds a cycle and returns null without one', () => {
    expect(findCycle([{ id: 1, after: [2] }, { id: 2, after: [1] }])).toEqual([1, 2, 1])
    expect(findCycle([{ id: 1, after: [] }, { id: 2, after: [1] }])).toBeNull()
  })
})

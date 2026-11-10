import { parsePlan } from '../src/model/plan'
import { indexPlan } from '../src/model/work'

/**
 * A small plan: m-a waits on m-b through task 3 -> 4. Task 1 is done, 2 is in progress and waits
 * on 1, 3 waits on 1 and 2, 4 is a supporting task in m-a and 5 waits on nothing.
 */
export const rawPlan = {
  asOf: '2026-11-09',
  statuses: [
    { id: 'done', label: 'done' },
    { id: 'doing', label: 'in progress' },
    { id: 'owner', label: 'waiting on owner' },
    { id: 'todo', label: 'not started' },
  ],
  types: [
    { id: 'functional', label: 'Functional' },
    { id: 'supporting', label: 'Supporting' },
  ],
  milestones: [
    { id: 'm-a', title: 'A first', goal: 'Do A.', status: 'todo', beeline: true, tasks: [4, 5] },
    { id: 'm-b', title: 'B base', goal: 'Do B.', status: 'doing', tasks: [1, 2, 3], source: 'docs/plan/m-b.md' },
  ],
  tasks: [
    { id: 1, title: 'One', detail: 'first', status: 'done', milestone: 'm-b', type: 'functional', after: [], text: 'See [PR 1](https://github.com/x/y/pull/1).' },
    { id: 2, title: 'Two', detail: 'second', status: 'doing', milestone: 'm-b', type: 'functional', after: [1], text: '' },
    { id: 3, title: 'Three', detail: 'third', status: 'todo', milestone: 'm-b', type: 'functional', after: [1, 2], text: '' },
    { id: 4, title: 'Four', detail: 'fourth', status: 'owner', milestone: 'm-a', type: 'supporting', after: [3], text: '', source: 'docs/plan/4.md' },
    { id: 5, title: 'Five', detail: 'fifth', status: 'todo', milestone: 'm-a', type: 'functional', after: [], text: '' },
  ],
}

export const plan = parsePlan(rawPlan).plan
export const index = indexPlan(plan)

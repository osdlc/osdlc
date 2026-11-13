import { describe, expect, it } from 'vitest'
import {
  BEELINE_END,
  BEELINE_START,
  beelineChecklist,
  beelineGroups,
  checklistItem,
  doerOf,
  openAfter,
  replaceBeeline,
} from '../src/model/beeline'
import { parsePlan } from '../src/model/plan'
import { indexPlan } from '../src/model/work'
import { plan, rawPlan } from './planFixture'

const ids = (tasks: { id: number }[]) => tasks.map((t) => t.id)
const href = (t: { id: number }) => `tasks/${t.id}.md`

// Both fixture milestones on the beeline: m-a lists 4, 5 and m-b lists 1, 2, 3. Task 2 has a PR.
const both = parsePlan({
  ...rawPlan,
  milestones: rawPlan.milestones.map((m) => ({ ...m, beeline: true })),
  tasks: rawPlan.tasks.map((t) => (t.id === 2 ? { ...t, prs: [{ label: 'x/y#7', url: 'https://github.com/x/y/pull/7' }] } : t)),
}).plan
const index = indexPlan(both)

describe('beeline checklist', () => {
  it('names the owner for an owner task and an agent for the rest', () => {
    expect(doerOf(index.task.get(4)!)).toBe('owner')
    expect(doerOf(index.task.get(5)!)).toBe('agent')
  })

  it('puts next-up tasks first, in progress before not started, then waiting, then done', () => {
    const groups = beelineGroups(index)
    expect(ids(groups.nextUp)).toEqual([2, 5])
    expect(ids(groups.waiting)).toEqual([4, 3])
    expect(ids(groups.done)).toEqual([1])
  })

  it('lists only the after tasks that are not done', () => {
    expect(openAfter(index, index.task.get(3)!)).toEqual([2])
    expect(openAfter(index, index.task.get(2)!)).toEqual([])
  })

  it('writes one line per task with its status, doer, pull requests and open after tasks', () => {
    expect(checklistItem(index, index.task.get(2)!, 'tasks/2.md')).toBe(
      '- [ ] [2 Two](tasks/2.md) · in progress · agent · [x/y#7](https://github.com/x/y/pull/7)',
    )
    expect(checklistItem(index, index.task.get(4)!, 'tasks/4.md')).toBe('- [ ] [4 Four](tasks/4.md) · waiting on owner · owner · waits on 3')
    expect(checklistItem(index, index.task.get(1)!, 'tasks/1.md')).toBe('- [x] [1 One](tasks/1.md) · done')
  })

  it('covers only the tasks of beeline milestones', () => {
    const text = beelineChecklist(plan, href)
    expect(text).toContain('beeline milestones: `m-a`.')
    expect(text).toContain('### Next up (1)\n\n- [ ] [5 Five](tasks/5.md)')
    expect(text).toContain('### Waiting (1)\n\n- [ ] [4 Four](tasks/4.md)')
    expect(text).not.toContain('[1 One]')
    expect(text).not.toContain('### Done')
  })
})

describe('replaceBeeline', () => {
  const file = `# Title\n\n${BEELINE_START}\nold\n${BEELINE_END}\n\nAfter.\n`

  it('replaces only the text between the markers, and a second run changes nothing', () => {
    const once = replaceBeeline(file, 'new')
    expect(once).toBe(`# Title\n\n${BEELINE_START}\n\nnew\n\n${BEELINE_END}\n\nAfter.\n`)
    expect(replaceBeeline(once!, 'new')).toBe(once)
  })

  it('is null when a marker is missing or the end comes first', () => {
    expect(replaceBeeline('# Title\n', 'new')).toBeNull()
    expect(replaceBeeline(`${BEELINE_START}\n`, 'new')).toBeNull()
    expect(replaceBeeline(`${BEELINE_END}\n${BEELINE_START}\n`, 'new')).toBeNull()
  })
})

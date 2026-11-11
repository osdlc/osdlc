import type { MilestonePhase, Plan, PlanMilestone, PlanTask, TaskStatus } from './plan'
import { DEFAULT_PHASE_LABEL, DEFAULT_STATUS_LABEL } from './plan'

/** Lookups over a parsed plan. Build it once; the plan does not change while the app runs. */
export interface PlanIndex {
  plan: Plan
  task: Map<number, PlanTask>
  milestone: Map<string, PlanMilestone>
  /** Each milestone's tasks: its own list order first, then any task that names it unlisted. */
  tasksOf: Map<string, PlanTask[]>
  /** The tasks that wait on each task, in task order. */
  unblocks: Map<number, PlanTask[]>
  statusLabel: (status: TaskStatus) => string
  phaseLabel: (phase: MilestonePhase) => string
}

export function indexPlan(plan: Plan): PlanIndex {
  const task = new Map(plan.tasks.map((t) => [t.id, t]))
  const milestone = new Map(plan.milestones.map((m) => [m.id, m]))
  const tasksOf = new Map<string, PlanTask[]>()
  for (const m of plan.milestones) {
    const listed = m.tasks.map((id) => task.get(id)).filter((t): t is PlanTask => t?.milestone === m.id)
    const unlisted = plan.tasks.filter((t) => t.milestone === m.id && !listed.includes(t))
    tasksOf.set(m.id, [...listed, ...unlisted])
  }
  const unblocks = new Map<number, PlanTask[]>(plan.tasks.map((t) => [t.id, []]))
  for (const t of plan.tasks) {
    for (const id of t.after) unblocks.get(id)?.push(t)
  }
  const labels = new Map(plan.statuses.map((s) => [s.id, s.label]))
  const phaseLabels = new Map(plan.phases.map((p) => [p.id, p.label]))
  return {
    plan,
    task,
    milestone,
    tasksOf,
    unblocks,
    statusLabel: (status) => labels.get(status) ?? DEFAULT_STATUS_LABEL[status],
    phaseLabel: (phase) => phaseLabels.get(phase) ?? DEFAULT_PHASE_LABEL[phase],
  }
}

/** The tasks a task waits on, in its `after` order. */
export function waitsOn(index: PlanIndex, id: number): PlanTask[] {
  return (index.task.get(id)?.after ?? []).map((a) => index.task.get(a)).filter((t): t is PlanTask => t !== undefined)
}

/** The tasks that wait on this one. */
export function unblocksOf(index: PlanIndex, id: number): PlanTask[] {
  return index.unblocks.get(id) ?? []
}

/** Next up: not done, and every task it waits on is done. */
export function isNextUp(index: PlanIndex, task: PlanTask): boolean {
  return task.status !== 'done' && waitsOn(index, task.id).every((t) => t.status === 'done')
}

export function nextUpIds(index: PlanIndex): Set<number> {
  return new Set(index.plan.tasks.filter((t) => isNextUp(index, t)).map((t) => t.id))
}

export interface Progress {
  done: number
  total: number
}

export function progressOf(tasks: readonly PlanTask[]): Progress {
  return { done: tasks.filter((t) => t.status === 'done').length, total: tasks.length }
}

export function progressText({ done, total }: Progress): string {
  return `${done} of ${total} done`
}

/** Waiting work first, finished work last. */
export const STATUS_ORDER: readonly TaskStatus[] = ['doing', 'owner', 'todo', 'done']

export interface StatusGroup {
  status: TaskStatus
  label: string
  tasks: PlanTask[]
}

/** The tasks grouped by status in STATUS_ORDER, leaving out empty groups. */
export function groupByStatus(index: PlanIndex, tasks: readonly PlanTask[]): StatusGroup[] {
  return STATUS_ORDER.map((status) => ({
    status,
    label: index.statusLabel(status),
    tasks: tasks.filter((t) => t.status === status),
  })).filter((group) => group.tasks.length > 0)
}

/** A task `after` link, from the prerequisite to the task that waits on it. */
export interface TaskLink {
  from: number
  to: number
}

export function taskLinks(plan: Plan): TaskLink[] {
  return plan.tasks.flatMap((t) => t.after.map((from) => ({ from, to: t.id })))
}

/** `to` waits on `from` because at least one of its tasks waits on one of `from`'s. */
export interface MilestoneDep {
  from: string
  to: string
  links: TaskLink[]
}

/** Milestone dependencies from the task links that cross milestones, in plan order. */
export function milestoneDeps(index: PlanIndex): MilestoneDep[] {
  const deps = new Map<string, MilestoneDep>()
  for (const link of taskLinks(index.plan)) {
    const from = index.task.get(link.from)?.milestone
    const to = index.task.get(link.to)?.milestone
    if (!from || !to || from === to || !index.milestone.has(from) || !index.milestone.has(to)) continue
    const key = `${from}->${to}`
    const dep = deps.get(key) ?? { from, to, links: [] }
    dep.links.push(link)
    deps.set(key, dep)
  }
  const order = new Map(index.plan.milestones.map((m, i) => [m.id, i]))
  const rank = (id: string) => order.get(id) ?? 0
  return [...deps.values()].sort((a, b) => rank(a.to) - rank(b.to) || rank(a.from) - rank(b.from))
}

/** The milestones `id` waits on, and the ones that wait on it. */
export function milestoneNeighbours(deps: readonly MilestoneDep[], id: string): { waitsOn: MilestoneDep[]; waitedOnBy: MilestoneDep[] } {
  return { waitsOn: deps.filter((d) => d.to === id), waitedOnBy: deps.filter((d) => d.from === id) }
}

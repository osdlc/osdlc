import type { FacetOption } from './filters'
import type { MilestonePhase, PlanTask, TaskStatus, TaskType } from './plan'
import { MILESTONE_PHASES, TASK_TYPES } from './plan'
import { STATUS_ORDER, type PlanIndex } from './work'

/**
 * `statuses`, `phases` and `milestones`: an empty list means no filter. A task's phase is its
 * milestone's. `types` lists the types shown, both by default. `nextUp` highlights the tasks that
 * can start now; it hides nothing.
 */
export interface WorkFilters {
  statuses: TaskStatus[]
  phases: MilestonePhase[]
  milestones: string[]
  types: TaskType[]
  nextUp: boolean
}

export function emptyWorkFilters(): WorkFilters {
  return { statuses: [], phases: [], milestones: [], types: [...TASK_TYPES], nextUp: false }
}

/** True when a filter hides something. The next-up highlight does not count. */
export function hasWorkFilters(filters: WorkFilters): boolean {
  return (
    filters.statuses.length + filters.phases.length + filters.milestones.length > 0 ||
    TASK_TYPES.some((t) => !filters.types.includes(t))
  )
}

export interface WorkFacets {
  statuses: FacetOption<TaskStatus>[]
  phases: FacetOption<MilestonePhase>[]
  milestones: FacetOption[]
  types: FacetOption<TaskType>[]
}

/**
 * Every status, phase, milestone and type with its task count: statuses in STATUS_ORDER, phases
 * in MILESTONE_PHASES order, milestones in plan order.
 */
export function workFacets(index: PlanIndex): WorkFacets {
  const { tasks, milestones } = index.plan
  return {
    statuses: STATUS_ORDER.map((value) => ({ value, count: tasks.filter((t) => t.status === value).length })),
    phases: MILESTONE_PHASES.map((value) => ({ value, count: tasks.filter((t) => phaseOf(index, t) === value).length })),
    milestones: milestones.map((m) => ({ value: m.id, count: index.tasksOf.get(m.id)?.length ?? 0 })),
    types: TASK_TYPES.map((value) => ({ value, count: tasks.filter((t) => t.type === value).length })),
  }
}

function phaseOf(index: PlanIndex, task: PlanTask): MilestonePhase | null {
  return index.milestone.get(task.milestone)?.phase ?? null
}

export function passesWorkFilters(index: PlanIndex, task: PlanTask, filters: WorkFilters): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false
  if (filters.milestones.length > 0 && !filters.milestones.includes(task.milestone)) return false
  if (filters.phases.length > 0) {
    const phase = phaseOf(index, task)
    if (phase === null || !filters.phases.includes(phase)) return false
  }
  return filters.types.includes(task.type)
}

export interface VisibleWork {
  tasks: Set<number>
  /** Milestones that pass the milestone filter and keep at least one task. */
  milestones: Set<string>
}

export function visibleWork(index: PlanIndex, filters: WorkFilters): VisibleWork {
  const tasks = new Set(index.plan.tasks.filter((t) => passesWorkFilters(index, t, filters)).map((t) => t.id))
  const milestones = new Set(
    index.plan.milestones
      .filter((m) => (index.tasksOf.get(m.id) ?? []).some((t) => tasks.has(t.id)))
      .map((m) => m.id),
  )
  return { tasks, milestones }
}

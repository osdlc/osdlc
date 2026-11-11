// Mirrors data/PLAN-SCHEMA.md. Change both together.

export type TaskStatus = 'done' | 'doing' | 'owner' | 'todo'
export type TaskType = 'functional' | 'supporting'
/** The part of the ecosystem a milestone builds. */
export type MilestonePhase = 'store' | 'model' | 'harness'

export const TASK_STATUSES: readonly TaskStatus[] = ['done', 'doing', 'owner', 'todo']
export const TASK_TYPES: readonly TaskType[] = ['functional', 'supporting']
export const MILESTONE_PHASES: readonly MilestonePhase[] = ['store', 'model', 'harness']

export interface PlanOption<T extends string> {
  id: T
  label: string
}

export interface PlanMilestone {
  id: string
  title: string
  goal: string
  status: TaskStatus
  /** Null when the data gives no known phase. */
  phase: MilestonePhase | null
  /** True for the milestones the work is heading for now. The Work view opens on them. */
  beeline: boolean
  /** Task ids in plan order. */
  tasks: number[]
  /** Repo-relative path of the milestone's markdown record, or null. */
  source: string | null
}

export interface PlanTask {
  id: number
  title: string
  /** One short line under the title. */
  detail: string
  status: TaskStatus
  milestone: string
  type: TaskType
  /** Ids of the tasks this one waits on. */
  after: number[]
  /** The plan's paragraph for the task, with markdown links and code. */
  text: string
  source: string | null
}

export interface Plan {
  asOf: string
  statuses: PlanOption<TaskStatus>[]
  types: PlanOption<TaskType>[]
  phases: PlanOption<MilestonePhase>[]
  /** In plan order. */
  milestones: PlanMilestone[]
  tasks: PlanTask[]
}

export const DEFAULT_STATUS_LABEL: Record<TaskStatus, string> = {
  done: 'done',
  doing: 'in progress',
  owner: 'waiting on owner',
  todo: 'not started',
}

export const DEFAULT_TYPE_LABEL: Record<TaskType, string> = {
  functional: 'Functional',
  supporting: 'Supporting',
}

export const DEFAULT_PHASE_LABEL: Record<MilestonePhase, string> = {
  store: 'Store',
  model: 'Model',
  harness: 'Harness',
}

export function emptyPlan(): Plan {
  return {
    asOf: '',
    statuses: defaultOptions(DEFAULT_STATUS_LABEL),
    types: defaultOptions(DEFAULT_TYPE_LABEL),
    phases: defaultOptions(DEFAULT_PHASE_LABEL),
    milestones: [],
    tasks: [],
  }
}

function defaultOptions<T extends string>(labels: Record<T, string>): PlanOption<T>[] {
  return (Object.keys(labels) as T[]).map((id) => ({ id, label: labels[id] }))
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function ids(value: unknown): number[] {
  return array(value).filter((id): id is number => typeof id === 'number' && Number.isInteger(id))
}

function isStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus)
}

function isType(value: unknown): value is TaskType {
  return TASK_TYPES.includes(value as TaskType)
}

function isPhase(value: unknown): value is MilestonePhase {
  return MILESTONE_PHASES.includes(value as MilestonePhase)
}

/** Data labels where given, the default label for any status, type or phase the data leaves out. */
function options<T extends string>(raw: unknown, valid: (v: unknown) => v is T, defaults: Record<T, string>): PlanOption<T>[] {
  const given = new Map<T, string>()
  for (const entry of array(raw).filter(isObject)) {
    if (valid(entry.id)) given.set(entry.id, text(entry.label, defaults[entry.id]))
  }
  return (Object.keys(defaults) as T[]).map((id) => ({ id, label: given.get(id) ?? defaults[id] }))
}

/** One cycle in the `after` edges, as task ids from the first to the one that closes it, or null. */
export function findCycle(tasks: readonly Pick<PlanTask, 'id' | 'after'>[]): number[] | null {
  const after = new Map(tasks.map((task) => [task.id, task.after]))
  const state = new Map<number, 'open' | 'closed'>()
  const stack: number[] = []
  function visit(id: number): number[] | null {
    state.set(id, 'open')
    stack.push(id)
    for (const next of after.get(id) ?? []) {
      if (!after.has(next)) continue
      if (state.get(next) === 'open') return [...stack.slice(stack.indexOf(next)), next]
      if (state.get(next) === undefined) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    state.set(id, 'closed')
    return null
  }
  for (const task of tasks) {
    if (state.get(task.id) !== undefined) continue
    const found = visit(task.id)
    if (found) return found
  }
  return null
}

/**
 * Reads plan.json leniently and lists every PLAN-SCHEMA.md rule it breaks. Bad references are
 * dropped from the result, so the rest of the app can trust every id it finds.
 */
export function parsePlan(raw: unknown): { plan: Plan; problems: string[] } {
  const plan = emptyPlan()
  if (!isObject(raw)) return { plan, problems: ['The plan file is not a JSON object.'] }
  const problems: string[] = []
  plan.asOf = text(raw.asOf)
  plan.statuses = options(raw.statuses, isStatus, DEFAULT_STATUS_LABEL)
  plan.types = options(raw.types, isType, DEFAULT_TYPE_LABEL)
  plan.phases = options(raw.phases, isPhase, DEFAULT_PHASE_LABEL)

  for (const entry of array(raw.milestones).filter(isObject)) {
    const id = text(entry.id)
    if (id === '') {
      problems.push('A milestone has no id; it is skipped.')
      continue
    }
    if (plan.milestones.some((m) => m.id === id)) {
      problems.push(`Milestone id "${id}" is used twice; the first one is kept.`)
      continue
    }
    if (!isStatus(entry.status)) problems.push(`Milestone "${id}" has unknown status "${String(entry.status)}".`)
    if (!isPhase(entry.phase)) problems.push(`Milestone "${id}" has unknown phase "${String(entry.phase)}".`)
    plan.milestones.push({
      id,
      title: text(entry.title, id),
      goal: text(entry.goal),
      status: isStatus(entry.status) ? entry.status : 'todo',
      phase: isPhase(entry.phase) ? entry.phase : null,
      beeline: entry.beeline === true,
      tasks: ids(entry.tasks),
      source: typeof entry.source === 'string' ? entry.source : null,
    })
  }

  for (const entry of array(raw.tasks).filter(isObject)) {
    if (typeof entry.id !== 'number' || !Number.isInteger(entry.id)) {
      problems.push(`A task has id ${JSON.stringify(entry.id)}, not a whole number; it is skipped.`)
      continue
    }
    const id = entry.id
    if (plan.tasks.some((t) => t.id === id)) {
      problems.push(`Task id ${id} is used twice; the first one is kept.`)
      continue
    }
    if (!isStatus(entry.status)) problems.push(`Task ${id} has unknown status "${String(entry.status)}".`)
    if (!isType(entry.type)) problems.push(`Task ${id} has unknown type "${String(entry.type)}".`)
    plan.tasks.push({
      id,
      title: text(entry.title, `Task ${id}`),
      detail: text(entry.detail),
      status: isStatus(entry.status) ? entry.status : 'todo',
      milestone: text(entry.milestone),
      type: isType(entry.type) ? entry.type : 'functional',
      after: ids(entry.after),
      text: text(entry.text),
      source: typeof entry.source === 'string' ? entry.source : null,
    })
  }

  const taskIds = new Set(plan.tasks.map((task) => task.id))
  const milestoneIds = new Set(plan.milestones.map((m) => m.id))

  for (const task of plan.tasks) {
    const unknown = task.after.filter((id) => !taskIds.has(id))
    for (const id of unknown) problems.push(`Task ${task.id} waits on unknown task ${id}; that link is dropped.`)
    if (task.after.includes(task.id)) problems.push(`Task ${task.id} waits on itself; that link is dropped.`)
    task.after = [...new Set(task.after.filter((id) => taskIds.has(id) && id !== task.id))]
    if (task.milestone === '') problems.push(`Task ${task.id} has no milestone.`)
    else if (!milestoneIds.has(task.milestone)) problems.push(`Task ${task.id} names unknown milestone "${task.milestone}".`)
  }

  const listedIn = new Map<number, string>()
  for (const milestone of plan.milestones) {
    for (const id of milestone.tasks) {
      if (!taskIds.has(id)) problems.push(`Milestone "${milestone.id}" lists unknown task ${id}; it is dropped.`)
      const first = listedIn.get(id)
      if (first !== undefined && first !== milestone.id) problems.push(`Task ${id} is listed in two milestones: "${first}" and "${milestone.id}".`)
      else if (first === undefined) listedIn.set(id, milestone.id)
    }
    milestone.tasks = [...new Set(milestone.tasks.filter((id) => taskIds.has(id)))]
  }

  for (const task of plan.tasks) {
    if (!milestoneIds.has(task.milestone)) continue
    const listed = listedIn.get(task.id)
    if (listed === undefined) problems.push(`Task ${task.id} is in "${task.milestone}" but that milestone does not list it.`)
    else if (listed !== task.milestone) problems.push(`Task ${task.id} says milestone "${task.milestone}" but "${listed}" lists it.`)
  }

  const cycle = findCycle(plan.tasks)
  if (cycle) problems.push(`The after links go round in a circle: ${cycle.join(' → ')}.`)

  return { plan, problems }
}

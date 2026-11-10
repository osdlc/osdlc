import type { Point } from './layout'
import type { PlanMilestone, PlanTask } from './plan'
import type { WorkLevel } from './route'
import type { MilestoneDep, PlanIndex, Progress } from './work'
import { isNextUp, progressOf, taskLinks } from './work'
import type { VisibleWork } from './workFilters'
import {
  LANE_HEAD_HEIGHT,
  LANE_HEAD_WIDTH,
  MILESTONE_HEIGHT,
  MILESTONE_WIDTH,
  TASK_HEIGHT,
  TASK_WIDTH,
  milestoneNodeId,
  taskNodeId,
  type WorkLayout,
} from './workLayout'

export type WorkSelection = { type: 'task'; id: number } | { type: 'milestone'; id: string } | null

interface CardState {
  selected: boolean
  dimmed: boolean
}

export interface TaskCardData extends CardState {
  kind: 'task'
  task: PlanTask
  statusLabel: string
  nextUp: boolean
  /** Next up, while the next-up highlight is on. */
  highlighted: boolean
}

export interface MilestoneCardData extends CardState {
  kind: 'milestone'
  milestone: PlanMilestone
  progress: Progress
  statusLabel: string
  /** `lane` heads a lane in the detailed level; `card` stands alone in the overview. */
  variant: 'lane' | 'card'
  /** Its tasks that are next up. */
  nextUp: number
  highlighted: boolean
}

export interface WorkNodeSpec {
  id: string
  type: 'task' | 'milestone'
  position: Point
  width: number
  height: number
  data: TaskCardData | MilestoneCardData
}

export interface WorkEdgeSpec {
  id: string
  source: string
  target: string
  class: string
  /** True when every prerequisite behind the edge is done, so it no longer holds anything up. */
  satisfied: boolean
}

export interface WorkFlowInput {
  index: PlanIndex
  deps: readonly MilestoneDep[]
  layout: WorkLayout
  level: WorkLevel
  visible: VisibleWork
  selection: WorkSelection
  highlightNext: boolean
}

interface Focus {
  nodes: Set<string>
  edges: Set<string>
}

export function taskEdgeId(from: number, to: number): string {
  return `task-${from}->task-${to}`
}

export function milestoneEdgeId(from: string, to: string): string {
  return `milestone-${from}->milestone-${to}`
}

/** What stays bright while something is selected, or null for no focus. */
export function workFocus(index: PlanIndex, deps: readonly MilestoneDep[], level: WorkLevel, selection: WorkSelection): Focus | null {
  if (selection === null) return null
  const focus: Focus = { nodes: new Set(), edges: new Set() }
  if (level === 'overview') {
    const id = selection.type === 'milestone' ? selection.id : index.task.get(selection.id)?.milestone
    if (id === undefined) return null
    focus.nodes.add(milestoneNodeId(id))
    for (const dep of deps) {
      if (dep.from !== id && dep.to !== id) continue
      focus.edges.add(milestoneEdgeId(dep.from, dep.to))
      focus.nodes.add(milestoneNodeId(dep.from))
      focus.nodes.add(milestoneNodeId(dep.to))
    }
    return focus
  }
  const inFocus =
    selection.type === 'task'
      ? (task: PlanTask) => task.id === selection.id
      : (task: PlanTask) => task.milestone === selection.id
  if (selection.type === 'milestone') focus.nodes.add(milestoneNodeId(selection.id))
  for (const task of index.plan.tasks) {
    if (!inFocus(task)) continue
    focus.nodes.add(taskNodeId(task.id))
    if (selection.type === 'task') focus.nodes.add(milestoneNodeId(task.milestone))
  }
  for (const link of taskLinks(index.plan)) {
    const from = index.task.get(link.from)
    const to = index.task.get(link.to)
    if (!from || !to || (!inFocus(from) && !inFocus(to))) continue
    focus.edges.add(taskEdgeId(link.from, link.to))
    focus.nodes.add(taskNodeId(link.from))
    focus.nodes.add(taskNodeId(link.to))
  }
  return focus
}

function edgeClass(focus: Focus | null, id: string, satisfied: boolean, extra: string[] = []): string {
  const classes = ['work-edge', ...extra]
  if (satisfied) classes.push('is-satisfied')
  if (focus) classes.push(focus.edges.has(id) ? 'is-focused' : 'is-dimmed')
  return classes.join(' ')
}

function milestoneData(input: WorkFlowInput, milestone: PlanMilestone, variant: 'lane' | 'card', focus: Focus | null): MilestoneCardData {
  const { index, selection, highlightNext } = input
  const tasks = index.tasksOf.get(milestone.id) ?? []
  const nextUp = tasks.filter((t) => isNextUp(index, t)).length
  const nodeId = milestoneNodeId(milestone.id)
  return {
    kind: 'milestone',
    milestone,
    progress: progressOf(tasks),
    statusLabel: index.statusLabel(milestone.status),
    variant,
    nextUp,
    highlighted: highlightNext && nextUp > 0,
    selected: selection?.type === 'milestone' && selection.id === milestone.id,
    // In the detailed level the highlight is on the tasks, so the lane headers never dim for it.
    dimmed: (focus !== null && !focus.nodes.has(nodeId)) || (highlightNext && variant === 'card' && nextUp === 0),
  }
}

/**
 * Vue Flow nodes and edges for the work map. Nodes come out lane by lane, each lane's header first
 * and then its tasks left to right, which is also the Tab order.
 */
export function toWorkFlow(input: WorkFlowInput): { nodes: WorkNodeSpec[]; edges: WorkEdgeSpec[] } {
  const { index, deps, layout, level, visible, selection, highlightNext } = input
  const focus = workFocus(index, deps, level, selection)
  const nodes: WorkNodeSpec[] = []
  const edges: WorkEdgeSpec[] = []
  const placed = (id: string) => layout.positions[id] !== undefined

  if (level === 'overview') {
    const milestones = index.plan.milestones.filter((m) => visible.milestones.has(m.id) && placed(milestoneNodeId(m.id)))
    for (const milestone of milestones) {
      const id = milestoneNodeId(milestone.id)
      nodes.push({
        id,
        type: 'milestone',
        position: layout.positions[id]!,
        width: MILESTONE_WIDTH,
        height: MILESTONE_HEIGHT,
        data: milestoneData(input, milestone, 'card', focus),
      })
    }
    nodes.sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    for (const dep of deps) {
      if (!visible.milestones.has(dep.from) || !visible.milestones.has(dep.to)) continue
      const id = milestoneEdgeId(dep.from, dep.to)
      const satisfied = dep.links.every((link) => index.task.get(link.from)?.status === 'done')
      edges.push({
        id,
        source: milestoneNodeId(dep.from),
        target: milestoneNodeId(dep.to),
        class: edgeClass(focus, id, satisfied),
        satisfied,
      })
    }
    return { nodes, edges }
  }

  for (const milestone of index.plan.milestones) {
    if (!visible.milestones.has(milestone.id)) continue
    const headId = milestoneNodeId(milestone.id)
    if (placed(headId)) {
      nodes.push({
        id: headId,
        type: 'milestone',
        position: layout.positions[headId]!,
        width: LANE_HEAD_WIDTH,
        height: LANE_HEAD_HEIGHT,
        data: milestoneData(input, milestone, 'lane', focus),
      })
    }
    const tasks = (index.tasksOf.get(milestone.id) ?? [])
      .filter((t) => visible.tasks.has(t.id) && placed(taskNodeId(t.id)))
      .map((task) => ({ task, position: layout.positions[taskNodeId(task.id)]! }))
      .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    for (const { task, position } of tasks) {
      const id = taskNodeId(task.id)
      const nextUp = isNextUp(index, task)
      nodes.push({
        id,
        type: 'task',
        position,
        width: TASK_WIDTH,
        height: TASK_HEIGHT,
        data: {
          kind: 'task',
          task,
          statusLabel: index.statusLabel(task.status),
          nextUp,
          highlighted: highlightNext && nextUp,
          selected: selection?.type === 'task' && selection.id === task.id,
          dimmed: (focus !== null && !focus.nodes.has(id)) || (highlightNext && !nextUp),
        },
      })
    }
  }

  for (const link of taskLinks(index.plan)) {
    const from = index.task.get(link.from)
    const to = index.task.get(link.to)
    if (!from || !to || !visible.tasks.has(from.id) || !visible.tasks.has(to.id)) continue
    if (!placed(taskNodeId(from.id)) || !placed(taskNodeId(to.id))) continue
    const id = taskEdgeId(from.id, to.id)
    const satisfied = from.status === 'done'
    edges.push({
      id,
      source: taskNodeId(from.id),
      target: taskNodeId(to.id),
      class: edgeClass(focus, id, satisfied, from.milestone === to.milestone ? [] : ['is-cross']),
      satisfied,
    })
  }
  return { nodes, edges }
}

/** The panel heading for a work selection. */
export function workHeading(index: PlanIndex, selection: WorkSelection): string {
  if (selection?.type === 'task') {
    const task = index.task.get(selection.id)
    return task ? `${task.id}. ${task.title}` : 'Details'
  }
  if (selection?.type === 'milestone') return index.milestone.get(selection.id)?.title ?? 'Details'
  return 'Details'
}

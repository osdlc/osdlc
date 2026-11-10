import type { Point } from './layout'
import type { MilestoneDep, PlanIndex } from './work'

export const TASK_WIDTH = 184
export const TASK_HEIGHT = 80
/** The milestone header at the left of each lane in the detailed level. */
export const LANE_HEAD_WIDTH = 264
export const LANE_HEAD_HEIGHT = 124
/** A milestone card in the overview. */
export const MILESTONE_WIDTH = 288
export const MILESTONE_HEIGHT = 136

const COLUMN = TASK_WIDTH + 48
const ROW_GAP = 14
const ROW = TASK_HEIGHT + ROW_GAP
const LANE_PAD = 14
/** Room left of the first column for the lane headers. */
const LANE_GUTTER = LANE_HEAD_WIDTH + 40
const OVERVIEW_COLUMN = MILESTONE_WIDTH + 96
const OVERVIEW_ROW = MILESTONE_HEIGHT + 28

export function taskNodeId(id: number): string {
  return `task-${id}`
}

export function milestoneNodeId(id: string): string {
  return `milestone-${id}`
}

/** What a work node id stands for, or null for an id this module did not make. */
export function parseWorkNodeId(nodeId: string): { type: 'task'; id: number } | { type: 'milestone'; id: string } | null {
  if (nodeId.startsWith('task-')) {
    const id = Number(nodeId.slice(5))
    return Number.isInteger(id) ? { type: 'task', id } : null
  }
  if (nodeId.startsWith('milestone-')) return { type: 'milestone', id: nodeId.slice(10) }
  return null
}

/**
 * The longest chain of prerequisites under each key: 0 for a key that waits on nothing. A cycle is
 * cut where it closes, so this always ends; the data check reports the cycle.
 */
export function depths<K>(keys: readonly K[], prerequisites: (key: K) => readonly K[]): Map<K, number> {
  const known = new Set(keys)
  const depth = new Map<K, number>()
  const open = new Set<K>()
  function visit(key: K): number {
    const done = depth.get(key)
    if (done !== undefined) return done
    if (open.has(key)) return 0
    open.add(key)
    let deepest = -1
    for (const before of prerequisites(key)) {
      if (known.has(before)) deepest = Math.max(deepest, visit(before))
    }
    open.delete(key)
    depth.set(key, deepest + 1)
    return deepest + 1
  }
  for (const key of keys) visit(key)
  return depth
}

/** Each task's column: one right of the furthest task it waits on, so every arrow points right. */
export function taskColumns(index: PlanIndex): Map<number, number> {
  return depths(
    index.plan.tasks.map((t) => t.id),
    (id) => index.task.get(id)?.after ?? [],
  )
}

/** A horizontal band holding one milestone's tasks. */
export interface Lane {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface WorkLayout {
  positions: Record<string, Point>
  lanes: Lane[]
}

/**
 * The detailed level: one lane per milestone in plan order, the header at its left. Tasks sit in
 * their column; tasks of one lane that share a column stack in the milestone's task order. A task
 * whose milestone is unknown has no lane and is not placed.
 */
export function detailLayout(index: PlanIndex): WorkLayout {
  const columns = taskColumns(index)
  const lastColumn = Math.max(0, ...columns.values())
  const x = -LANE_GUTTER
  const width = LANE_GUTTER + lastColumn * COLUMN + TASK_WIDTH + 32
  const positions: Record<string, Point> = {}
  const lanes: Lane[] = []
  let y = 0
  for (const milestone of index.plan.milestones) {
    const tasks = index.tasksOf.get(milestone.id) ?? []
    const rowOf = new Map<number, number>()
    const used = new Map<number, number>()
    for (const task of tasks) {
      const column = columns.get(task.id) ?? 0
      const row = used.get(column) ?? 0
      used.set(column, row + 1)
      rowOf.set(task.id, row)
    }
    const rows = Math.max(1, ...used.values())
    const content = rows * ROW - ROW_GAP
    const inner = Math.max(LANE_HEAD_HEIGHT, content)
    const top = y + LANE_PAD + (inner - content) / 2
    for (const task of tasks) {
      positions[taskNodeId(task.id)] = { x: (columns.get(task.id) ?? 0) * COLUMN, y: top + (rowOf.get(task.id) ?? 0) * ROW }
    }
    positions[milestoneNodeId(milestone.id)] = { x: x + 14, y: y + LANE_PAD + (inner - LANE_HEAD_HEIGHT) / 2 }
    const height = inner + 2 * LANE_PAD
    lanes.push({ id: milestone.id, x, y, width, height })
    y += height
  }
  return { positions, lanes }
}

/**
 * The overview: milestone cards only. A card's column is one right of the furthest milestone it
 * waits on; cards that share a column stack in plan order, so the beeline leads each column.
 */
export function overviewLayout(index: PlanIndex, deps: readonly MilestoneDep[]): WorkLayout {
  const ids = index.plan.milestones.map((m) => m.id)
  const column = depths(ids, (id) => deps.filter((d) => d.to === id).map((d) => d.from))
  const used = new Map<number, number>()
  const positions: Record<string, Point> = {}
  for (const id of ids) {
    const c = column.get(id) ?? 0
    const row = used.get(c) ?? 0
    used.set(c, row + 1)
    positions[milestoneNodeId(id)] = { x: c * OVERVIEW_COLUMN, y: row * OVERVIEW_ROW }
  }
  return { positions, lanes: [] }
}

/** The rectangle around every lane, or around every placed card when there are no lanes. */
export function workBounds(layout: WorkLayout, size: { width: number; height: number }) {
  if (layout.lanes.length > 0) {
    const x = Math.min(...layout.lanes.map((l) => l.x))
    const y = Math.min(...layout.lanes.map((l) => l.y))
    const right = Math.max(...layout.lanes.map((l) => l.x + l.width))
    const bottom = Math.max(...layout.lanes.map((l) => l.y + l.height))
    return { x, y, width: right - x, height: bottom - y }
  }
  const points = Object.values(layout.positions)
  if (points.length === 0) return null
  const x = Math.min(...points.map((p) => p.x))
  const y = Math.min(...points.map((p) => p.y))
  const right = Math.max(...points.map((p) => p.x)) + size.width
  const bottom = Math.max(...points.map((p) => p.y)) + size.height
  return { x, y, width: right - x, height: bottom - y }
}

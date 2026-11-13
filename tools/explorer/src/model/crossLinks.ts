import type { PlanTask } from './plan'
import type { DisplayGraph, DisplayNode } from './twins'

/** Where a task's or milestone's markdown record lives on GitHub. */
export const SOURCE_BASE = 'https://github.com/osdlc/markdown/blob/main/'

export function sourceUrl(source: string | null): string | null {
  return source === null || source === '' ? null : SOURCE_BASE + source.replace(/^\/+/, '')
}

/** The component cards a plan task changes: every card with a member whose `tasks` has the task's number. */
export function cardsForTask(graph: DisplayGraph, taskId: number): DisplayNode[] {
  return graph.nodes.filter((card) => card.members.some((member) => member.tasks.includes(taskId)))
}

/** A component's plan task numbers, each with its plan task, or null when the plan has no such task. */
export function planTaskRefs(ids: readonly number[], tasks: ReadonlyMap<number, PlanTask>): { id: number; task: PlanTask | null }[] {
  return ids.map((id) => ({ id, task: tasks.get(id) ?? null }))
}

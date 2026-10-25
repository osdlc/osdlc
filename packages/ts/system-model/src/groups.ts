/**
 * `@osdlc/system-model/groups`: the groups a catalog's reports fall into.
 * Tasks from runners come first, then the actions synthesized from package
 * managers, tool managers and hook managers. Each synthesized group is one
 * runner id, so a report's group follows from its `runner`.
 *
 * Browser-safe: no Node built-in and no dependency, so a web view can import
 * it.
 */

/**
 * The runner ids of the three synthesized groups.
 *
 * @experimental
 */
export const SYNTHESIZED_RUNNERS = {
  packageManager: 'package-manager',
  toolManager: 'tool-manager',
  hookManager: 'hook-manager',
} as const

/**
 * A group's stable id.
 *
 * @experimental
 */
export type GroupId = 'tasks' | 'dependencies' | 'tools' | 'hooks'

/**
 * One group of reports.
 *
 * @experimental
 */
export interface Group {
  id: GroupId
  /** A display title: `Tasks`, `Git hooks`. */
  title: string
  /** The synthesized runner that fills it. Absent for `tasks`, which every other runner fills. */
  runner?: string | undefined
}

/**
 * Every group, in display order.
 *
 * @experimental
 */
export const GROUPS: readonly Group[] = [
  { id: 'tasks', title: 'Tasks' },
  { id: 'dependencies', title: 'Dependencies', runner: SYNTHESIZED_RUNNERS.packageManager },
  { id: 'tools', title: 'Tools', runner: SYNTHESIZED_RUNNERS.toolManager },
  { id: 'hooks', title: 'Git hooks', runner: SYNTHESIZED_RUNNERS.hookManager },
]

/**
 * The group a runner's report belongs to.
 *
 * @experimental
 */
export function groupOf(runner: string): Group {
  return GROUPS.find((g) => g.runner === runner) ?? GROUPS[0]!
}

/**
 * The groups that have at least one report, in display order, each with its
 * runners in report order.
 *
 * @experimental
 */
export function catalogGroups(
  reports: readonly { runner: string }[],
): Array<{ id: GroupId; title: string; runners: string[] }> {
  return GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    runners: reports.filter((r) => groupOf(r.runner) === g).map((r) => r.runner),
  })).filter((g) => g.runners.length > 0)
}

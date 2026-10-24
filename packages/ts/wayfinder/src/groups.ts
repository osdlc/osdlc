/**
 * The row groups every surface shows: tasks from runners, then the actions
 * system-model synthesizes from package managers, tool managers and hook
 * managers. Each synthesized group is one runner id, so grouping is a
 * property of the report. Browser-safe: the page imports it.
 */

/** A group's stable id, as `--json` prints it. */
export type GroupId = 'tasks' | 'dependencies' | 'tools' | 'hooks'

export interface Group {
  id: GroupId
  title: string
  /** The synthesized runner that fills it; absent for tasks, which every other runner fills. */
  runner?: string
}

/**
 * In display order. The runner ids are `SYNTHESIZED_RUNNERS` from
 * `@osdlc/system-model/detect`, restated because that entry is not
 * browser-safe; a test checks they agree.
 */
export const GROUPS: readonly Group[] = [
  { id: 'tasks', title: 'Tasks' },
  { id: 'dependencies', title: 'Dependencies', runner: 'package-manager' },
  { id: 'tools', title: 'Tools', runner: 'tool-manager' },
  { id: 'hooks', title: 'Git hooks', runner: 'hook-manager' },
]

/** The group a runner's report belongs to. */
export function groupOf(runner: string): Group {
  return GROUPS.find((g) => g.runner === runner) ?? GROUPS[0]!
}

/** Position of a runner's group in {@link GROUPS}. */
export function groupRank(runner: string): number {
  return GROUPS.indexOf(groupOf(runner))
}

/** What a tab shows for a runner: the group's name for a synthesized group, else the runner id. */
export function runnerLabel(runner: string): string {
  const group = groupOf(runner)
  return group.runner === runner ? group.title.toLowerCase() : runner
}

/** The groups that have at least one report, each with its runners in report order. */
export function catalogGroups(
  reports: readonly { runner: string }[],
): Array<{ id: GroupId; title: string; runners: string[] }> {
  return GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    runners: reports.filter((r) => groupOf(r.runner) === g).map((r) => r.runner),
  })).filter((g) => g.runners.length > 0)
}

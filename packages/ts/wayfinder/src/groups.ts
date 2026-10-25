/**
 * The row groups every surface shows: tasks from runners, then the actions
 * system-model synthesizes from package managers, tool managers and hook
 * managers, then agent skills. The report groups are
 * `@osdlc/system-model/groups`; this module adds the order wayfinder sorts
 * reports by and the Skills group, whose rows are `CatalogSnapshot.skills`
 * rather than a report. Browser-safe: the page imports it.
 */

import { GROUPS, catalogGroups, groupOf, type GroupId } from '@osdlc/system-model/groups'

export { GROUPS, catalogGroups, groupOf } from '@osdlc/system-model/groups'
export type { Group, GroupId } from '@osdlc/system-model/groups'
export { runnerLabel } from './vocabulary.ts'

/** Position of a runner's group in {@link GROUPS}. */
export function groupRank(runner: string): number {
  return GROUPS.indexOf(groupOf(runner))
}

/** The Skills group. Its rows are skills, not a runner's tasks, so it names no runner. */
export const SKILLS_GROUP = { id: 'skills', title: 'Skills' } as const

/** A group as a document lists it. */
export interface DocumentGroup {
  id: GroupId | typeof SKILLS_GROUP.id
  title: string
  /** The runners whose reports fill it. Empty for Skills. */
  runners: string[]
}

/** The groups with rows, in display order: the report groups, then Skills when there are skills. */
export function documentGroups(
  reports: readonly { runner: string }[],
  skillCount: number,
): DocumentGroup[] {
  const groups: DocumentGroup[] = catalogGroups(reports)
  return skillCount > 0 ? [...groups, { ...SKILLS_GROUP, runners: [] }] : groups
}

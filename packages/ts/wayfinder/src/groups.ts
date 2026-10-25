/**
 * The row groups every surface shows: tasks from runners, then the actions
 * system-model synthesizes from package managers, tool managers and hook
 * managers. The table is `@osdlc/system-model/groups`; this module adds the
 * order wayfinder sorts reports by. Browser-safe: the page imports it.
 */

import { GROUPS, groupOf } from '@osdlc/system-model/groups'

export { GROUPS, catalogGroups, groupOf } from '@osdlc/system-model/groups'
export type { Group, GroupId } from '@osdlc/system-model/groups'
export { runnerLabel } from './vocabulary.ts'

/** Position of a runner's group in {@link GROUPS}. */
export function groupRank(runner: string): number {
  return GROUPS.indexOf(groupOf(runner))
}

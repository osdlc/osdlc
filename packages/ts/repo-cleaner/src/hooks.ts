/**
 * What a host may supply that this package cannot know for itself.
 *
 * A standalone run passes none; a host passes `annotate` so its verdicts
 * survive `applyPlan`'s re-sweep.
 */

import type { RepoInfo, SweepItem } from './types.ts'

/**
 * Re-rank a repository's swept rows with what the host knows. Runs after the
 * sweep, on its output; it never reaches into classification.
 */
export type Annotate = (repo: RepoInfo, items: SweepItem[]) => SweepItem[]

export interface HostHooks {
  annotate?: Annotate | undefined
}

/**
 * Builds `PrFacts` from a `CodeHostPr`. This is the one place `behind` and
 * `ahead` are computed. They come from local git, never from a code host field.
 *
 * GitHub reports `mergeStateStatus: BEHIND` only when branch protection
 * requires an up-to-date branch. On a repository without that rule the field
 * says nothing, however far the branch has drifted. Forgejo has no such field.
 * So the drift is measured locally, the same way for every host.
 */

import { Git } from '@osdlc/typed-git'

import type { CommandRunner } from '@osdlc/command-seam'
import type { CodeHostPr, PrFacts } from './types.ts'

/**
 * `behind` and `ahead` are null when a ref cannot be resolved, for example a
 * ref this checkout never fetched. Null means "unknown". It is never zero,
 * because zero reads as "up to date" and would hide a real drift.
 */
export function assemblePrFacts(
  pr: CodeHostPr,
  projectRoot: string,
  gitRunner: CommandRunner,
): PrFacts {
  const git = new Git(projectRoot, { runner: gitRunner })
  const outcome = git.try.aheadBehind(`origin/${pr.baseRef}`, `origin/${pr.headRef}`)
  return {
    ...pr,
    behind: outcome.ok ? outcome.value.behind : null,
    ahead: outcome.ok ? outcome.value.ahead : null,
  }
}

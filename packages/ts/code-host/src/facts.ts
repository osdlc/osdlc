/**
 * Assembling `PrFacts` from a `CodeHostPr` — the one place `behind`/`ahead` get
 * computed, from local git, never a code host field.
 *
 * GitHub only reports `mergeStateStatus: BEHIND` when branch protection
 * requires an up-to-date branch, so on a repository without one the field is
 * silent no matter how far a branch has drifted; Forgejo has no equivalent
 * field at all. this measures it locally
 * for exactly that reason, code-host-agnostic.
 */

import { Git } from '@osdlc/typed-git'

import type { CommandRunner } from '@osdlc/command-seam'
import type { CodeHostPr, PrFacts } from './types.ts'

/**
 * `behind`/`ahead` are null when the refs aren't resolvable (a ref this
 * checkout never fetched) — null means "unknown", never zero, since zero
 * reads as "up to date" and would silently clear a real drift.
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

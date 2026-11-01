/**
 * The pull requests of a repository, indexed by head branch.
 *
 * One listing per repository, not one query per branch: a repository with
 * sixty branches would otherwise pay sixty round trips to answer a question
 * one listing covers. Which forge answers is the provider's business; see
 * `providers/`.
 */

import type { PrProvider } from './providers/index.ts'
import type { PRInfo, RepoInfo } from './types.ts'

/** Open outranks merged outranks closed, and a newer PR outranks an older. */
function priority(state: string): number {
  return ({ OPEN: 3, MERGED: 2, CLOSED: 1 } as Record<string, number>)[state] ?? 0
}

/**
 * Every same-repository pull request, keyed by head branch. Fork PRs are
 * dropped by the provider: a fork branch that shares a name proves nothing
 * about ours.
 *
 * A branch can carry several PRs over its life. The one that decides a
 * verdict is the most live: an open PR means keep whatever else happened, and
 * a merged one means the work landed. Ties go to the higher number, so two
 * runs over unchanged state agree.
 *
 * An empty map is the honest answer when the provider's CLI is missing,
 * unauthenticated or failing, or when there is no provider. Classification
 * degrades to git evidence and the report says so.
 *
 * @param provider The provider to ask. It is asked only when it is the one
 *   `repo.provider` names and that probe found it signed in.
 * @param branch Ask only for PRs whose head is exactly this branch; rows
 *   for any other head are dropped here too.
 */
export function fetchPrs(
  repo: RepoInfo,
  provider: PrProvider,
  branch?: string,
): Map<string, PRInfo> {
  const byHead = new Map<string, PRInfo>()
  const status = repo.provider
  if (status === null || status.name !== provider.name || !status.authenticated) return byHead

  const rows = provider.listPrs(repo.root, status, branch)
  if (rows === null) return byHead

  for (const info of rows) {
    const head = info.headRef
    if (!head) continue
    if (branch !== undefined && head !== branch) continue
    const existing = byHead.get(head)
    if (existing === undefined) {
      byHead.set(head, info)
      continue
    }
    const prio = priority(info.state)
    const existingPrio = priority(existing.state)
    if (prio > existingPrio || (prio === existingPrio && info.number > existing.number)) {
      byHead.set(head, info)
    }
  }
  return byHead
}

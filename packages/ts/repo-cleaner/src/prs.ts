/**
 * The pull requests of a repository, indexed by head branch.
 *
 * One listing per repository, not one query per branch: a repository with
 * sixty branches would otherwise pay sixty round trips to answer a question
 * one listing covers. Which forge answers is the provider's business; see
 * `providers/`.
 */

import type { PrProvider } from './providers/index.ts'
import type { ProviderStatus } from './providers/types.ts'
import type { PRInfo, RepoInfo } from './types.ts'
import { errorText } from './util.ts'

/** Why the provider did not answer, and the words for it. */
export interface PrsUnchecked {
  kind: 'not-installed' | 'not-signed-in' | 'list-failed'
  /** For a sentence: "`gh` is not installed", "`gh pr list` failed". */
  why: string
}

/**
 * Why open pull requests cannot be ruled out for this repository, or null
 * when the provider answered. A missing or signed-out CLI was never asked, and
 * a failed listing answered nothing; either way a remote branch with no known
 * PR may still have an open one. Every sentence about a lookup that did not
 * answer is built from this one answer.
 */
export function prsUnchecked(status: ProviderStatus): PrsUnchecked | null {
  if (!status.available)
    return { kind: 'not-installed', why: `\`${status.tool}\` is not installed` }
  if (!status.authenticated) {
    return { kind: 'not-signed-in', why: `\`${status.tool}\` is not signed in` }
  }
  if (status.listError !== undefined) {
    return { kind: 'list-failed', why: `\`${status.listing}\` failed` }
  }
  return null
}

/** Open outranks merged outranks closed, and a newer PR outranks an older. */
function priority(state: string): number {
  return ({ OPEN: 3, MERGED: 2, CLOSED: 1 } as Record<string, number>)[state] ?? 0
}

/** A provider's answer for one repository: its pull requests, or why there are none to read. */
export interface PrLookup {
  /** Pull requests keyed by head branch; empty when the lookup failed or was not made. */
  prs: Map<string, PRInfo>
  /**
   * Why the listing failed, in the provider's own words where it gave any;
   * null when it answered, or when it was not asked at all.
   */
  error: string | null
}

/**
 * Every same-repository pull request, keyed by head branch, and why there are
 * none when the listing failed. Fork PRs are dropped by the provider: a fork
 * branch that shares a name proves nothing about ours.
 *
 * A branch can carry several PRs over its life. The one that decides a
 * verdict is the most live: an open PR means keep whatever else happened, and
 * a merged one means the work landed. Ties go to the higher number, so two
 * runs over unchanged state agree.
 *
 * The map is empty when the provider's CLI is missing or unauthenticated, when
 * there is no provider, and when the listing fails. A provider that answers
 * null or throws has failed (a repository the signed-in account cannot see, a
 * forge that is down, output that cannot be read), and `error` says why.
 * Classification then degrades to git evidence, and the sweep notes it rather
 * than losing every row to one listing.
 *
 * @param provider The provider to ask. It is asked only when it is the one
 *   `repo.provider` names and that probe found it signed in.
 * @param branch Ask only for PRs whose head is exactly this branch; rows
 *   for any other head are dropped here too.
 */
export function lookupPrs(repo: RepoInfo, provider: PrProvider, branch?: string): PrLookup {
  const byHead = new Map<string, PRInfo>()
  const status = repo.provider
  if (status === null || status.name !== provider.name || !status.authenticated) {
    return { prs: byHead, error: null }
  }

  let rows: PRInfo[] | null
  try {
    rows = provider.listPrs(repo.root, status, branch)
  } catch (err) {
    return { prs: byHead, error: errorText(err) }
  }
  if (rows === null) return { prs: byHead, error: 'the provider gave no reason' }

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
  return { prs: byHead, error: null }
}

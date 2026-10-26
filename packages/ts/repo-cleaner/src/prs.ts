/**
 * The pull requests of a repository, indexed by head branch.
 *
 * One `gh pr list` per repository, not one query per branch: a repository with
 * sixty branches would otherwise pay sixty round trips to answer a question
 * one listing covers.
 */

import type { Gh } from '@osdlc/typed-gh'

import type { PRInfo, RepoInfo } from './types.ts'

/** The fields classification consults. Asking for more costs latency. */
const FIELDS = [
  'number',
  'state',
  'mergedAt',
  'headRefName',
  'headRefOid',
  'baseRefName',
  'isCrossRepository',
  'title',
  'url',
] as const

const LIMIT = 300

/** Open outranks merged outranks closed, and a newer PR outranks an older. */
function priority(state: string): number {
  return ({ OPEN: 3, MERGED: 2, CLOSED: 1 } as Record<string, number>)[state] ?? 0
}

/**
 * Every same-repository pull request, keyed by head branch. Fork PRs are
 * dropped: a fork branch that shares a name proves nothing about ours.
 *
 * A branch can carry several PRs over its life. The one that decides a
 * verdict is the most live: an open PR means keep whatever else happened, and
 * a merged one means the work landed. Ties go to the higher number, so two
 * runs over unchanged state agree.
 *
 * An empty map is the honest answer when `gh` is missing, unauthenticated or
 * failing. Classification degrades to git evidence and the report says so.
 *
 * @param headPrefix Ask `gh` only for PRs whose head starts with this; the map is
 *   still keyed by exact head. typed-gh's `head` is exact, so the prefix goes
 *   through gh's `head:` search, which matches by prefix, and is checked again here.
 */
export function fetchPrs(repo: RepoInfo, gh: Gh, headPrefix?: string): Map<string, PRInfo> {
  const byHead = new Map<string, PRInfo>()
  if (!(repo.hasGh && repo.ghAuthenticated)) return byHead

  const rows = gh.at(repo.root).prList({
    state: 'all',
    limit: LIMIT,
    fields: FIELDS,
    search: headPrefix === undefined ? undefined : `head:${headPrefix}`,
  })
  if (rows === null) return byHead

  for (const row of rows.rows) {
    const head = row.headRefName
    // A fork's head branch is not this repository's branch, whatever its name.
    if (!head || row.isCrossRepository) continue
    if (headPrefix !== undefined && !head.startsWith(headPrefix)) continue
    const info: PRInfo = {
      number: row.number,
      state: row.state,
      mergedAt: row.mergedAt,
      headRef: head,
      headOid: row.headRefOid,
      baseRef: row.baseRefName,
      title: row.title,
      url: row.url,
    }
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

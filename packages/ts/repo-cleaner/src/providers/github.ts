/** Pull requests from GitHub, through `gh`. */

import type { Gh, PullRequest } from '@osdlc/typed-gh'

import type { PRInfo } from '../types.ts'
import type { PrProvider } from './types.ts'

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

/** The most PRs one listing of every state reads, newest first. */
export const PR_LIMIT = 300

/**
 * The most open PRs one listing reads. Open PRs are what gate a delete, and a
 * repository has few of them; a listing that reaches this is incomplete.
 */
export const OPEN_PR_LIMIT = 1000

/**
 * A provider over `gh pr list`, aimed at the remote the sweep judges
 * (`--repo [host/]owner/name`), not the repository `gh` would pick from the
 * checkout's remotes (`upstream` over `origin`).
 *
 * It reads every open PR (up to {@link OPEN_PR_LIMIT}) and the newest
 * {@link PR_LIMIT} of any state, so an old open PR is not lost to newer merged
 * ones. The listing is incomplete, and says so, when the open PRs hit their
 * cap, and when the repository is a fork: PRs opened from it to its parent
 * live in the parent and are not read. A listing `gh` fails, such as one for
 * a repository the signed-in account cannot see, throws with `gh`'s reason.
 */
export function githubProvider(gh: Gh): PrProvider {
  return {
    name: 'github',
    words: { tool: 'gh', noun: 'PR', listing: 'gh pr list' },
    probe(root) {
      const available = gh.at(root).installed()
      return { available, authenticated: available && gh.at(root).authenticated() }
    },
    listPrs(root, target, branch) {
      let client = gh.at(root)
      if (target.project !== null) {
        client = client.withRepo(target.project)
        if (target.host !== null) client = client.withHostname(target.host)
      }
      const incomplete: string[] = []
      const rows: PullRequest[] = []
      // A branch narrows the listing to its own PRs, so its one listing is whole
      // unless that branch alone has more PRs than the cap.
      if (branch === undefined) {
        const open = client.prList({ state: 'open', limit: OPEN_PR_LIMIT, fields: FIELDS })
        if (open === null) return null
        rows.push(...open.rows)
        if (open.truncated) {
          incomplete.push(`the repository has more than ${OPEN_PR_LIMIT} open PRs`)
        }
      }
      const all = client.prList({ state: 'all', limit: PR_LIMIT, fields: FIELDS, head: branch })
      if (all === null) return null
      rows.push(...all.rows)
      if (branch !== undefined && all.truncated) {
        incomplete.push(`more than ${PR_LIMIT} PRs have the head ${branch}`)
      }
      const parent = target.project === null ? null : parentOf(client)
      if (parent !== null) {
        incomplete.push(
          `the repository is a fork of ${parent}, and PRs from it to ${parent} are not listed`,
        )
      }

      const prs: PRInfo[] = []
      for (const row of rows) {
        // A fork's head branch is not this repository's branch, whatever its name.
        if (!row.headRefName || row.isCrossRepository) continue
        prs.push({
          number: row.number,
          state: row.state,
          mergedAt: row.mergedAt,
          headRef: row.headRefName,
          headOid: row.headRefOid,
          baseRef: row.baseRefName,
          title: row.title,
          url: row.url,
        })
      }
      return incomplete.length === 0 ? prs : { prs, incomplete: incomplete.join('; ') }
    },
  }
}

/** The parent's `owner/name` when the client's repository is a fork; null when it is not, or could not be read. */
function parentOf(client: Gh): string | null {
  const answer = client.api('repos/{owner}/{repo}')
  const body = answer.body
  if (!answer.ok || typeof body !== 'object' || body === null) return null
  const { fork, parent } = body as { fork?: unknown; parent?: { full_name?: unknown } | null }
  if (fork !== true) return null
  return typeof parent?.full_name === 'string' ? parent.full_name : 'its parent'
}

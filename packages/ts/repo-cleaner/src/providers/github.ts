/** Pull requests from GitHub, through `gh`. */

import type { Gh, PullRequest } from '@osdlc/typed-gh'

import type { PRInfo } from '../types.ts'
import { errorText } from '../util.ts'
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
 * cap, when one branch has more than {@link PR_LIMIT} PRs, and when the
 * repository's fork status cannot be read.
 *
 * PRs opened from a fork live in the parent they target. For a fork, the
 * parent's PRs whose head repository is the fork are listed too, under the
 * same caps, and count for the fork's branches; a parent listing that fails
 * or is capped leaves the listing incomplete, as does a fork whose parent
 * cannot be named. A listing `gh` fails, such as one for
 * a repository the signed-in account cannot see, throws with `gh`'s reason.
 */
export function githubProvider(gh: Gh): PrProvider {
  // Fork status per repository: it does not change between one listing and the next.
  const parents = new Map<string, string | null>()
  // Whether gh is signed in to a host, per host. A remote's host can be an SSH
  // alias (`git@github-work:acme/app.git`) that gh maps to the real host itself.
  const known = new Map<string, boolean>()
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
        // Name the host only when gh holds credentials for it; otherwise gh's own host rules apply.
        if (target.host !== null) {
          const named = client.withHostname(target.host)
          let signedIn = known.get(target.host)
          if (signedIn === undefined) {
            signedIn = named.authenticated()
            known.set(target.host, signedIn)
          }
          if (signedIn) client = named
        }
      }
      const incomplete: string[] = []
      const own = listing(client, branch, FIELDS, null)
      if (own === null) return null
      incomplete.push(...own.capped)
      const rows: PullRequest[] = [...own.rows]
      // The parent's PRs from this fork: cross-repository there, but this
      // repository's branches.
      const fromFork = new Set<PullRequest>()
      if (target.project !== null) {
        const key = `${target.host ?? ''}/${target.project}`
        let parent = parents.get(key)
        if (parent === undefined) {
          parent = parentOf(client)
          parents.set(key, parent)
        }
        if (parent === 'unknown') {
          incomplete.push('whether the repository is a fork could not be read')
        } else if (parent === FORK_WITHOUT_PARENT) {
          incomplete.push(
            'the repository is a fork of its parent, and PRs from it to its parent are not listed',
          )
        } else if (parent !== null) {
          // A PR from a fork lives in the parent it targets: read the parent's
          // PRs whose head repository is this fork.
          const owner = target.project.split('/')[0]!.toLowerCase()
          let theirs: Listing | null = null
          let why = 'the listing gave no reason'
          try {
            theirs = listing(
              client.withRepo(parent),
              branch,
              [...FIELDS, 'headRepositoryOwner'],
              parent,
            )
          } catch (err) {
            why = errorText(err)
          }
          if (theirs === null) {
            incomplete.push(
              `the repository is a fork of ${parent}, whose PRs could not be listed (${why})`,
            )
          } else {
            incomplete.push(...theirs.capped)
            for (const r of theirs.rows) {
              if (r.isCrossRepository && r.headRepositoryOwner?.toLowerCase() === owner) {
                rows.push(r)
                fromFork.add(r)
              }
            }
          }
        }
      }

      const prs: PRInfo[] = []
      for (const row of rows) {
        // A fork's head branch is not this repository's branch, whatever its name.
        if (!row.headRefName || (row.isCrossRepository && !fromFork.has(row))) continue
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

/** One repository's PRs, and why the listing may have left some out. */
interface Listing {
  rows: PullRequest[]
  capped: string[]
}

/**
 * Every open PR and the newest {@link PR_LIMIT} of any state, or a branch's
 * PRs only. A branch narrows the listing to its own PRs, so its one listing
 * is whole unless that branch alone has more PRs than the cap.
 */
function listing(
  client: Gh,
  branch: string | undefined,
  fields: readonly string[],
  /** The repository's name for the reasons; null for the one listed for. */
  name: string | null,
): Listing | null {
  const rows: PullRequest[] = []
  const capped: string[] = []
  if (branch === undefined) {
    const open = client.prList({ state: 'open', limit: OPEN_PR_LIMIT, fields })
    if (open === null) return null
    rows.push(...open.rows)
    if (open.truncated) {
      capped.push(`${name ?? 'the repository'} has more than ${OPEN_PR_LIMIT} open PRs`)
    }
  }
  const all = client.prList({ state: 'all', limit: PR_LIMIT, fields, head: branch })
  if (all === null) return null
  rows.push(...all.rows)
  if (branch !== undefined && all.truncated) {
    const where = name === null ? '' : ` in ${name}`
    capped.push(`more than ${PR_LIMIT} PRs${where} have the head ${branch}`)
  }
  return { rows, capped }
}

/** What {@link parentOf} answers for a fork whose parent it could not name. */
const FORK_WITHOUT_PARENT = 'its parent'

/** The parent's `owner/name` when the client's repository is a fork; null when it is not; `'unknown'` when it could not be read. */
function parentOf(client: Gh): string | null {
  const answer = client.api('repos/{owner}/{repo}')
  const body = answer.body
  if (!answer.ok || typeof body !== 'object' || body === null) return 'unknown'
  const { fork, parent } = body as { fork?: unknown; parent?: { full_name?: unknown } | null }
  if (fork !== true) return null
  return typeof parent?.full_name === 'string' ? parent.full_name : FORK_WITHOUT_PARENT
}

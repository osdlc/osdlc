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
  'headRepositoryOwner',
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
  const forks = new Map<string, Fork>()
  // Each repository's listing, per branch: a parent judged as a remote of its
  // own is listed once, for itself and for its forks.
  const listings = new Map<string, Listing | null>()
  // Whether gh is signed in to a host, per host. A remote's host can be an SSH
  // alias (`git@github-work:acme/app.git`) that gh maps to the real host itself.
  const known = new Map<string, boolean>()
  const listOnce = (client: Gh, key: string, branch: string | undefined): Listing | null => {
    const at = `${key}\0${branch ?? ''}`
    if (!listings.has(at)) listings.set(at, listing(client, branch))
    return listings.get(at)!
  }
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
      const host = target.host ?? ''
      const own = listOnce(client, `${host}/${target.project ?? root}`, branch)
      if (own === null) return null
      const incomplete = capReasons(own, branch, null)
      // A fork's head branch is not this repository's branch, whatever its name.
      const rows = own.rows.filter((r) => !r.isCrossRepository)
      if (target.project !== null) {
        const key = `${host}/${target.project}`
        let fork = forks.get(key)
        if (fork === undefined) {
          fork = forkOf(client)
          forks.set(key, fork)
        }
        if (fork.kind === 'unknown') {
          incomplete.push('whether the repository is a fork could not be read')
        } else if (fork.kind === 'fork' && fork.parent === null) {
          incomplete.push(
            'the repository is a fork of its parent, and PRs from it to its parent are not listed',
          )
        } else if (fork.kind === 'fork' && fork.parent !== null) {
          // A PR from a fork lives in the parent it targets: read the parent's
          // PRs whose head repository is this fork.
          const parent = fork.parent
          const owner = target.project.split('/')[0]!.toLowerCase()
          let theirs: Listing | null = null
          let why = 'the listing gave no reason'
          try {
            theirs = listOnce(client.withRepo(parent), `${host}/${parent}`, branch)
          } catch (err) {
            why = errorText(err)
          }
          if (theirs === null) {
            incomplete.push(
              `the repository is a fork of ${parent}, whose PRs could not be listed (${why})`,
            )
          } else {
            incomplete.push(...capReasons(theirs, branch, parent))
            rows.push(
              ...theirs.rows.filter(
                (r) => r.isCrossRepository && r.headRepositoryOwner?.toLowerCase() === owner,
              ),
            )
          }
        }
      }

      const prs: PRInfo[] = rows
        .filter((row) => row.headRefName !== '')
        .map((row) => ({
          number: row.number,
          state: row.state,
          mergedAt: row.mergedAt,
          headRef: row.headRefName,
          headOid: row.headRefOid,
          baseRef: row.baseRefName,
          title: row.title,
          url: row.url,
        }))
      return incomplete.length === 0 ? prs : { prs, incomplete: incomplete.join('; ') }
    },
  }
}

/** One repository's PRs, and whether a cap cut the listing short. */
interface Listing {
  rows: PullRequest[]
  /** More open PRs than {@link OPEN_PR_LIMIT}. */
  openCapped: boolean
  /** With a branch: more PRs of that head than {@link PR_LIMIT}. */
  headCapped: boolean
}

/**
 * Every open PR and the newest {@link PR_LIMIT} of any state, or a branch's
 * PRs only. A branch narrows the listing to its own PRs, so its one listing
 * is whole unless that branch alone has more PRs than the cap.
 */
function listing(client: Gh, branch: string | undefined): Listing | null {
  const rows: PullRequest[] = []
  let openCapped = false
  if (branch === undefined) {
    const open = client.prList({ state: 'open', limit: OPEN_PR_LIMIT, fields: FIELDS })
    if (open === null) return null
    rows.push(...open.rows)
    openCapped = open.truncated
  }
  const all = client.prList({ state: 'all', limit: PR_LIMIT, fields: FIELDS, head: branch })
  if (all === null) return null
  rows.push(...all.rows)
  return { rows, openCapped, headCapped: branch !== undefined && all.truncated }
}

/** Why `l` may leave PRs out, naming the repository `name` (null: the one listed for). */
function capReasons(l: Listing, branch: string | undefined, name: string | null): string[] {
  const out: string[] = []
  if (l.openCapped) out.push(`${name ?? 'the repository'} has more than ${OPEN_PR_LIMIT} open PRs`)
  if (l.headCapped) {
    const where = name === null ? '' : ` in ${name}`
    out.push(`more than ${PR_LIMIT} PRs${where} have the head ${branch}`)
  }
  return out
}

/** Whether a repository is a fork, and of which parent when GitHub names it. */
type Fork = { kind: 'not-fork' } | { kind: 'unknown' } | { kind: 'fork'; parent: string | null }

/** The client's repository's fork status; `unknown` when it could not be read. */
function forkOf(client: Gh): Fork {
  const answer = client.api('repos/{owner}/{repo}')
  const body = answer.body
  if (!answer.ok || typeof body !== 'object' || body === null) return { kind: 'unknown' }
  const { fork, parent } = body as { fork?: unknown; parent?: { full_name?: unknown } | null }
  if (fork !== true) return { kind: 'not-fork' }
  return { kind: 'fork', parent: typeof parent?.full_name === 'string' ? parent.full_name : null }
}

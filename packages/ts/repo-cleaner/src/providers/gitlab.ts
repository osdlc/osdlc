/**
 * Merge requests from GitLab, through `glab api`.
 *
 * The REST listing, not `glab mr list`: it carries the source and target
 * project ids, which is how a fork's merge request is told apart, and it takes
 * an explicit host and project, so a checkout with several remotes is read
 * against the one the sweep measures.
 */

import {
  parseJsonResult,
  runFailed,
  stderrOrError,
  type CommandResult,
  type CommandRunner,
} from '@osdlc/command-seam'

import type { PRInfo } from '../types.ts'
import { PR_LIMIT } from './github.ts'
import type { PrProvider } from './types.ts'

const PER_PAGE = 100

/** GitLab's states, as the GitHub names classification reads. A locked MR is an open one mid-update. */
const STATE: Record<string, string> = {
  opened: 'OPEN',
  locked: 'OPEN',
  merged: 'MERGED',
  closed: 'CLOSED',
}

/** The fields of a merge request this reads. */
interface MergeRequest {
  iid: number
  state: string
  source_branch: string
  target_branch: string
  sha?: string | null
  merged_at?: string | null
  web_url?: string
  title?: string
  source_project_id: number
  target_project_id: number
}

/** Absent, or of the given type (null counting where `nullable`). */
function optional(value: unknown, type: 'string', nullable = false): boolean {
  return value === undefined || (nullable && value === null) || typeof value === type
}

function isMergeRequest(value: unknown): value is MergeRequest {
  if (typeof value !== 'object' || value === null) return false
  const mr = value as Record<string, unknown>
  return (
    optional(mr['sha'], 'string', true) &&
    optional(mr['merged_at'], 'string', true) &&
    optional(mr['web_url'], 'string') &&
    optional(mr['title'], 'string') &&
    typeof mr['iid'] === 'number' &&
    typeof mr['state'] === 'string' &&
    typeof mr['source_branch'] === 'string' &&
    typeof mr['target_branch'] === 'string' &&
    typeof mr['source_project_id'] === 'number' &&
    typeof mr['target_project_id'] === 'number'
  )
}

/** One merge request as a {@link PRInfo}, or null for a fork's or an unknown state's. */
export function mergeRequestToPr(mr: MergeRequest): PRInfo | null {
  // A fork's source branch is not this repository's branch, whatever its name.
  if (mr.source_project_id !== mr.target_project_id) return null
  const state = STATE[mr.state]
  if (state === undefined || mr.source_branch === '') return null
  return {
    number: mr.iid,
    state,
    mergedAt: mr.merged_at ?? null,
    headRef: mr.source_branch,
    headOid: typeof mr.sha === 'string' && mr.sha !== '' ? mr.sha : null,
    baseRef: mr.target_branch,
    title: mr.title ?? '',
    url: mr.web_url ?? '',
  }
}

/** Exited 0 with all its output captured. */
function succeeded(result: CommandResult): boolean {
  return !runFailed(result)
}

/**
 * A provider over `glab`. It needs `target.project`. A listing it cannot
 * make or read throws with the reason: no project in the remote URL, `glab`'s
 * own error, or a page that cannot be read.
 */
export function gitlabProvider(glab: CommandRunner): PrProvider {
  const run = (root: string, argv: string[]): CommandResult => glab.run(argv, { cwd: root })
  const hostArgs = (host: string | null): string[] => (host === null ? [] : ['--hostname', host])
  return {
    name: 'gitlab',
    words: { tool: 'glab', noun: 'merge request', listing: 'glab api' },
    probe(root, target) {
      const available = succeeded(run(root, ['--version']))
      const authenticated =
        available && succeeded(run(root, ['auth', 'status', ...hostArgs(target.host)]))
      return { available, authenticated }
    },
    listPrs(root, target, branch) {
      if (target.project === null) throw new Error('the remote URL names no GitLab project')
      const project = encodeURIComponent(target.project)
      const prs: PRInfo[] = []
      for (let page = 1; (page - 1) * PER_PAGE < PR_LIMIT; page++) {
        const query = new URLSearchParams({
          state: 'all',
          per_page: String(PER_PAGE),
          page: String(page),
          order_by: 'updated_at',
          sort: 'desc',
        })
        if (branch !== undefined) query.set('source_branch', branch)
        const result = run(root, [
          'api',
          ...hostArgs(target.host),
          `projects/${project}/merge_requests?${query.toString()}`,
        ])
        // A failed, cut-short or unreadable page fails the listing: a missing
        // open MR would read as no MR.
        if (!succeeded(result)) {
          // Not stdout: a page cut short is half a JSON listing, not a reason.
          throw new Error(
            result.outputIncomplete === true
              ? `page ${page} was cut short`
              : stderrOrError(result) || `glab exited ${String(result.exitCode)}`,
          )
        }
        const listed = parseJsonResult(result)
        if (!listed.ok || !Array.isArray(listed.value)) {
          throw new Error(`page ${page} is not a merge request list`)
        }
        const rows: unknown[] = listed.value
        for (const row of rows) {
          if (!isMergeRequest(row)) continue
          const pr = mergeRequestToPr(row)
          if (pr !== null) prs.push(pr)
        }
        if (rows.length < PER_PAGE) break
      }
      return prs
    },
  }
}

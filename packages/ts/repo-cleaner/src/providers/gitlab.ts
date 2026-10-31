/**
 * Merge requests from GitLab, through `glab api`.
 *
 * The REST listing, not `glab mr list`: it carries the source and target
 * project ids, which is how a fork's merge request is told apart, and it takes
 * an explicit host and project, so a checkout with several remotes is read
 * against the one the sweep measures.
 */

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

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
  sha: string | null
  merged_at: string | null
  web_url: string
  title: string
  source_project_id: number
  target_project_id: number
}

function isMergeRequest(value: unknown): value is MergeRequest {
  if (typeof value !== 'object' || value === null) return false
  const mr = value as Record<string, unknown>
  return (
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
    title: typeof mr.title === 'string' ? mr.title : '',
    url: typeof mr.web_url === 'string' ? mr.web_url : '',
  }
}

function succeeded(result: CommandResult): boolean {
  return result.neverExited !== true && result.exitCode === 0
}

/**
 * A provider over `glab`. It needs `target.project`: without one there is
 * nothing to ask, and the listing answers null.
 *
 * GitLab filters `source_branch` by exact name only, so a head prefix is sent
 * as an exact branch. The sweep only narrows to one exact branch, so this is
 * enough for it; a caller with a true prefix gets the exact match only.
 */
export function gitlabProvider(glab: CommandRunner): PrProvider {
  const run = (root: string, argv: string[]): CommandResult => glab.run(argv, { cwd: root })
  const hostArgs = (host: string | null): string[] => (host === null ? [] : ['--hostname', host])
  return {
    name: 'gitlab',
    tool: 'glab',
    probe(root, target) {
      const available = succeeded(run(root, ['--version']))
      const authenticated =
        available && succeeded(run(root, ['auth', 'status', ...hostArgs(target.host)]))
      return { available, authenticated }
    },
    listPrs(root, target, headPrefix) {
      if (target.project === null) return null
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
        if (headPrefix !== undefined) query.set('source_branch', headPrefix)
        const result = run(root, [
          'api',
          ...hostArgs(target.host),
          `projects/${project}/merge_requests?${query.toString()}`,
        ])
        // A failed page fails the listing: a missing open MR would read as no MR.
        if (!succeeded(result)) return null
        let rows: unknown
        try {
          rows = JSON.parse(result.stdout)
        } catch {
          return null
        }
        if (!Array.isArray(rows)) return null
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

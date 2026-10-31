/** Pull requests from GitHub, through `gh`. */

import type { Gh } from '@osdlc/typed-gh'

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

/** The most PRs one listing reads. */
export const PR_LIMIT = 300

/**
 * A provider over `gh pr list`. `gh` picks the repository from the checkout's
 * remotes, so `target` is not consulted.
 *
 * typed-gh's `head` filter is exact, so a head prefix goes through gh's
 * `head:` search, which matches by prefix.
 */
export function githubProvider(gh: Gh): PrProvider {
  return {
    name: 'github',
    tool: 'gh',
    probe(root) {
      const available = gh.at(root).installed()
      return { available, authenticated: available && gh.at(root).authenticated() }
    },
    listPrs(root, _target, headPrefix) {
      const rows = gh.at(root).prList({
        state: 'all',
        limit: PR_LIMIT,
        fields: FIELDS,
        search: headPrefix === undefined ? undefined : `head:${headPrefix}`,
      })
      if (rows === null) return null
      const prs: PRInfo[] = []
      for (const row of rows.rows) {
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
      return prs
    },
  }
}

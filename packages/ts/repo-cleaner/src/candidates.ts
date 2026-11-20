/**
 * A sweep's rows as plain data for a host that runs its own phases (one
 * that runs its own phases): what could be deleted, what would object,
 * and what it depends on. `removeCandidate` (in `clean.ts`) takes one back.
 */

import { fingerprint } from './plan.ts'
import {
  landedRef,
  rowId,
  type Action,
  type Blocker,
  type Kind,
  type Risk,
  type Row,
  type RowId,
  type Sweep,
  type Verdict,
} from './types.ts'

/** One row of a sweep, as data a host can compare, object to and hand back. */
export interface CleanCandidate {
  id: RowId
  kind: Kind
  /** The main checkout's root the row belongs to. */
  repo: string
  /** A worktree's path; for a branch, its name; for a remote branch, `<remote>/<branch>`. */
  path: string
  verdict: Verdict
  /** What deleting it does; null when it can never be deleted. */
  action: Action | null
  /** One line, already phrased for a report. */
  why: string
  /** The row's evidence, as the sweep read it. */
  evidence: Row['evidence']
  /** The evidence a re-check compares with `sameFingerprint`. */
  fingerprint: Record<string, unknown>
  /** The row ids this one cannot go without: a branch needs the worktree that has it checked out. */
  requires?: RowId[]
  /** Why it can never be deleted as things stand; one `refuse` objection each. */
  blockers: Blocker[]
  /** What its deletion loses; one `protest` objection each, allowed by name. */
  risks: Risk[]
  /** The repository's remote, where an archive is pushed; null without one. */
  remote: string | null
  /** The ref a row must reach to count as landed, the base an archive is made on. */
  landedRef: string
}

/**
 * The rows of `sweep` that could be deleted or that object to it: every row
 * with an action or a blocker. Rows kept for structure (the primary
 * worktree, a branch a worktree holds) are left out.
 */
export function candidatesOf(sweep: Sweep): CleanCandidate[] {
  return sweep.repos.flatMap((swept) => {
    const repo = swept.repo
    if (repo === null) return []
    return swept.rows
      .filter((row) => row.action !== null || row.blockers.length > 0)
      .map((row): CleanCandidate => {
        const worktree = row.kind === 'branch' ? row.evidence.worktree : undefined
        return {
          id: row.id,
          kind: row.kind,
          repo: repo.root,
          path: row.name,
          verdict: row.verdict,
          action: row.action,
          why: row.why,
          evidence: row.evidence,
          fingerprint: fingerprint(row),
          ...(worktree === undefined ? {} : { requires: [rowId('worktree', worktree)] }),
          blockers: [...row.blockers],
          risks: [...row.risks],
          remote: repo.remote,
          landedRef: landedRef(repo),
        }
      })
  })
}

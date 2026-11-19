/**
 * The `git` plugin: repo-cleaner's sweep as candidates, its blockers and
 * risks as objections, and `removeCandidate` as the delete.
 */

import {
  RISKS,
  candidatesOf,
  removeCandidate,
  sweep,
  type ArchiveOptions,
  type CleanCandidate,
  type Risk,
  type Runners,
  type SweepOptions,
} from '@osdlc/repo-cleaner'

import { FatalRun, type Candidate, type Objection, type Plugin } from './types.ts'

export interface GitPluginOptions extends Runners {
  /** What the sweep judges; `annotate`, `cwd` and progress are the plugin's to set. */
  sweep?: Pick<
    SweepOptions,
    'only' | 'remote' | 'offline' | 'against' | 'provider' | 'branch' | 'cacheDir'
  >
  /** Archive unlanded work to the remote before deleting it. A failed archive push stops the run. */
  archive?: ArchiveOptions | undefined
}

/**
 * A worktree's id is its row id, which names a path; a branch's carries its
 * repository, since two repositories can have branches of one name.
 */
function candidateId(c: CleanCandidate): string {
  return c.kind === 'worktree' ? c.id : `${c.kind}:${c.repo}:${c.path}`
}

export function gitPlugin(opts: GitPluginOptions = {}): Plugin {
  /** The last discovery's rows, kept for `object` and `delete`; `discover` makes them afresh. */
  let rows = new Map<string, CleanCandidate>()
  const isRisk = (code: string): code is Risk => (RISKS as readonly string[]).includes(code)

  return {
    name: 'git',
    detect: () => true,
    discover(ctx) {
      const swept = sweep(ctx.targets, {
        ...opts.sweep,
        git: opts.git,
        gh: opts.gh,
        glab: opts.glab,
        probe: opts.probe,
        cwd: ctx.cwd,
      })
      rows = new Map()
      return candidatesOf(swept).map((row): Candidate => {
        const id = candidateId(row)
        rows.set(id, row)
        return {
          id,
          kind: row.kind,
          path: row.kind === 'worktree' ? row.path : `${row.repo}:${row.path}`,
          owner: 'git',
          why: row.why,
          evidence: row.fingerprint,
          ...(row.requires === undefined ? {} : { requires: row.requires }),
          unattended: row.verdict === 'delete' && row.risks.length === 0,
        }
      })
    },
    object(all) {
      return all.flatMap((c): Objection[] => {
        const row = rows.get(c.id)
        if (c.owner !== 'git' || row === undefined) return []
        const own = (level: Objection['level'], code: string, reason: string): Objection => ({
          by: 'git',
          candidate: c.id,
          level,
          code,
          reason,
        })
        return [
          ...row.blockers.map((b) => own('refuse', b, `${row.why} (${b})`)),
          ...row.risks.map((r) => own('protest', r, `deleting it risks ${r}`)),
        ]
      })
    },
    delete(c, ctx) {
      const row = rows.get(c.id)
      if (row === undefined) throw new Error(`git: ${c.id} was not discovered in this run`)
      const result = removeCandidate(row, {
        git: opts.git,
        gh: opts.gh,
        glab: opts.glab,
        probe: opts.probe,
        cwd: ctx.cwd,
        archive: opts.archive,
        allow: ctx.allow.filter(isRisk),
      })
      const error = result.error ?? 'failed'
      if (result.archiveFailed) throw new FatalRun(`archive failed: ${error}`)
      if (!result.ok) throw new Error(error)
      return result.steps.map((s) => s.verification ?? s.command).join('; ')
    },
  }
}

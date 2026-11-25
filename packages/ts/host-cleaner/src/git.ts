/**
 * The `git` plugin: repo-cleaner's sweep as candidates, its blockers and
 * risks as objections, and `removeCandidate` as the delete.
 */

import { lstatSync } from 'node:fs'

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
  type WorktreeEvidence,
} from '@osdlc/repo-cleaner'
import { z } from 'zod'

import {
  FatalRun,
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Objection,
  type Plugin,
  type PluginDefinition,
} from './types.ts'

export interface GitPluginOptions extends Runners {
  /** What the sweep judges; the plugin sets `cwd` from the run. */
  sweep?: Pick<
    SweepOptions,
    'only' | 'remotes' | 'fetch' | 'offline' | 'against' | 'provider' | 'branch' | 'cacheDir'
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

/** The name `--spare` knows a row by: a branch's name, or the branch a worktree has checked out. */
function nameOf(row: CleanCandidate): string | null {
  if (row.kind === 'branch') return row.path
  return row.kind === 'worktree' ? ((row.evidence as WorktreeEvidence).branch ?? null) : null
}

export function gitPlugin(opts: GitPluginOptions = {}): Plugin {
  /** The last discovery's rows, kept for `object` and `delete`; `discover` makes them afresh. */
  let rows = new Map<string, CleanCandidate>()
  const runners = { git: opts.git, gh: opts.gh, glab: opts.glab, probe: opts.probe }
  const isRisk = (code: string): code is Risk => (RISKS as readonly string[]).includes(code)

  return {
    name: 'git',
    detect: () => true,
    discover(ctx) {
      const found = candidatesOf(sweep(ctx.targets, { ...opts.sweep, ...runners, cwd: ctx.cwd }))
      rows = new Map(found.map((row) => [candidateId(row), row]))
      return found.map((row): Candidate => {
        const id = candidateId(row)
        const common = {
          id,
          kind: row.kind,
          ...(nameOf(row) === null ? {} : { name: nameOf(row)! }),
          owner: 'git',
          why: row.why,
          evidence: row.fingerprint,
          ...(row.requires === undefined ? {} : { requires: row.requires }),
          // The default run skips what is not `delete`.
          ...(row.verdict !== 'delete' ? { held: true } : {}),
        }
        // A branch has no folder of its own: it is a ref in its repository.
        return row.kind === 'worktree'
          ? { ...common, path: row.path }
          : { ...common, ref: row.path, at: row.repo }
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
      // `git worktree remove` follows a link, and would empty the folder it leads to.
      if (c.path !== undefined && lstatSync(c.path, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error(`git: ${c.path} is now a symlink; its worktree is not removed through it`)
      }
      const result = removeCandidate(row, {
        ...runners,
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

/**
 * The `git` plugin as a definition, with no settings of its own.
 *
 * @param opts - Passed to `gitPlugin`. The command line passes `--worktrees`
 *   and `--branches` here as `sweep.only`, so no other plugin's `create` sees
 *   git's kinds. They are copied, so changing them afterwards changes no
 *   plugin the definition builds.
 */
export function gitDefinitionWith(opts: GitPluginOptions = {}): PluginDefinition {
  const { sweep, ...rest } = opts
  const own: GitPluginOptions =
    sweep === undefined
      ? rest
      : { ...rest, sweep: { ...sweep, only: sweep.only && [...sweep.only] } }
  return definePlugin({
    name: 'git',
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: () => gitPlugin(own),
  })
}

/** The `git` plugin's definition, sweeping worktrees and local branches. */
export const gitDefinition = gitDefinitionWith()

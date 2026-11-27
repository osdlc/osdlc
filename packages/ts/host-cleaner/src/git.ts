/**
 * The `git` plugin: repo-cleaner's sweep as candidates, its blockers and
 * risks as objections, `archiveCandidates` in `prepare`, and `removeCandidate`
 * as the delete.
 */

import { lstatSync } from 'node:fs'

import { nodeGuard } from '@osdlc/path-guard/node'
import {
  RISKS,
  archiveCandidates,
  archiveProblem,
  candidatesOf,
  mayContribute,
  noRemote,
  removeCandidate,
  sweep,
  type ArchiveOptions,
  type CandidateArchive,
  type CleanCandidate,
  type Risk,
  type Runners,
  type SweepOptions,
  type WorktreeEvidence,
} from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { DISCOVER_LIMIT_MS, objector } from './helpers.ts'
import { linkedCheckouts } from './roots.ts'
import { DELETE_LIMIT_MS } from './run.ts'
import {
  FatalRun,
  PLUGIN_API,
  builtIn,
  definePlugin,
  type Candidate,
  type Ctx,
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
  /**
   * Archive unlanded work to the remote before deleting it: one archive per
   * repository, pushed in `prepare`. A failed archive push stops the run. A
   * caller with its own core sets `ctx.run` to every candidate it will run
   * before the first `prepare` (see `RunCtx.run`).
   */
  archive?: ArchiveOptions | undefined
}

/**
 * A worktree's id is its row id, which names a path; a branch's carries its
 * repository, since two repositories can have branches of one name.
 */
function candidateId(c: CleanCandidate): string {
  return c.kind === 'worktree' ? c.id : `${c.kind}:${c.repo}:${c.path}`
}

/** The sentence that names an archive pushed: its ref and the commit it lists. */
const listsLine = (record: NonNullable<CandidateArchive['record']>): string =>
  `${record.ref} lists ${record.sha}`

/** The name `--spare` knows a row by: a branch's name, or the branch a worktree has checked out. */
function nameOf(row: CleanCandidate): string | null {
  if (row.kind === 'branch') return row.path
  return row.kind === 'worktree' ? ((row.evidence as WorktreeEvidence).branch ?? null) : null
}

/** `opts` with its objects and lists copied; the runners are the caller's own. */
function copyOf(opts: GitPluginOptions): GitPluginOptions {
  const { sweep, archive } = opts
  return {
    ...opts,
    ...(sweep && {
      sweep: {
        ...sweep,
        only: sweep.only && [...sweep.only],
        remotes: sweep.remotes && [...sweep.remotes],
      },
    }),
    ...(archive && { archive: { ...archive, exclude: archive.exclude && [...archive.exclude] } }),
  }
}

/**
 * The `git` plugin.
 *
 * @param given - Copied, so changing it afterwards does not change the plugin.
 */
export function gitPlugin(given: GitPluginOptions = {}): Plugin {
  const opts = copyOf(given)
  /** The last discovery's rows, kept for the later phases; `detect` empties them and `discover` makes them afresh. */
  let rows = new Map<string, CleanCandidate>()
  /** The archive this run pushed for each repository, by its root; `detect` and `discover` empty it. */
  const archives = new Map<string, CandidateArchive>()
  const runners = { git: opts.git, gh: opts.gh, glab: opts.glab, probe: opts.probe }
  const own = objector('git')
  const isRisk = (code: string): code is Risk => (RISKS as readonly string[]).includes(code)

  const rowOf = (c: Candidate): CleanCandidate => {
    const row = rows.get(c.id)
    if (row === undefined) throw new Error(`git: ${c.id} was not discovered in this run`)
    return row
  }

  /**
   * Archive the unlanded work of what this run deletes in `row`'s repository,
   * once a run when `ctx.run` names it all; else again for each row the last
   * archive does not hold. `pushed` is set when this call pushed one.
   */
  const archiveRepo = (
    row: CleanCandidate,
    ctx: Ctx,
  ): { made: CandidateArchive; pushed: boolean } => {
    const done = archives.get(row.repo)
    const holds = (a: CandidateArchive) => a.stamps.has(row.id) || a.refused.has(row.id)
    if (done !== undefined && (!mayContribute(row) || holds(done))) {
      return { made: done, pushed: false }
    }
    const running = (ctx.run ?? []).flatMap((c) => {
      const r = c.owner === 'git' ? rows.get(c.id) : undefined
      return r?.repo === row.repo ? [r] : []
    })
    let made: CandidateArchive
    try {
      made = archiveCandidates(running.includes(row) ? running : [row, ...running], {
        ...runners,
        cwd: ctx.cwd,
        archive: opts.archive!,
        allow: ctx.allow.filter(isRisk),
      })
    } catch (err) {
      throw new FatalRun(`archive failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    archives.set(row.repo, made)
    return { made, pushed: made.record !== null }
  }

  /**
   * The git worktree rows this run deletes that hold `c`, a candidate of
   * another plugin: their archive is made before `c` is touched. Compared by
   * real path, since git names a worktree resolved and a plugin may not.
   */
  const worktreesHolding = (c: Candidate, ctx: Ctx): CleanCandidate[] =>
    (ctx.run ?? []).flatMap((q) => {
      const r = q.owner === 'git' ? rows.get(q.id) : undefined
      return r?.kind === 'worktree' &&
        mayContribute(r) &&
        c.path !== undefined &&
        nodeGuard.contains(r.path, c.path)
        ? [r]
        : []
    })

  return builtIn({
    name: 'git',
    // The sweep covers every repository in one call that nothing can stop part way,
    // and `prepare` pushes an archive, which may wait on the remote as long as a delete.
    limits: { discover: DISCOVER_LIMIT_MS, prepare: DELETE_LIMIT_MS },
    // A survey or inspect starts here: what an earlier `discover` found is not this run's.
    detect: () => {
      rows = new Map()
      archives.clear()
      return true
    },
    discover(ctx) {
      const found = candidatesOf(sweep(ctx.targets, { ...opts.sweep, ...runners, cwd: ctx.cwd }))
      rows = new Map(found.map((row) => [candidateId(row), row]))
      archives.clear()
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
    // A worktree whose folder is gone, or left without its `.git`, has no
    // checkout the core could find its repository from: git, which found it in
    // its repository, declares it so its prune is not refused outside-roots.
    // One of a repository a target is in, the core counts already.
    roots(ctx) {
      const gone = [...rows.values()].filter(
        (row) => row.kind === 'worktree' && (row.evidence as WorktreeEvidence).onDisk === false,
      )
      // Nothing to root, as before `discover`: git is not run for every target.
      if (gone.length === 0) return []
      const counted = new Set(linkedCheckouts(ctx.targets))
      return gone.flatMap((row) =>
        counted.has(row.path) ? [] : [{ path: row.path, self: true as const }],
      )
    },
    object(all) {
      return all.flatMap((c): Objection[] => {
        const row = rows.get(c.id)
        if (c.owner !== 'git' || row === undefined) return []
        const unarchivable =
          opts.archive !== undefined && row.remote === null && mayContribute(row)
            ? [own(c, 'refuse', 'no-remote', noRemote(row.repo))]
            : []
        return [
          ...row.blockers.map((b) => own(c, 'refuse', b, `${row.why} (${b})`)),
          ...unarchivable,
          ...row.risks.map((r) => own(c, 'protest', r, `deleting it risks ${r}`)),
        ]
      })
    },
    prepare(c, ctx) {
      if (opts.archive === undefined) return
      const sentence = (a: { made: CandidateArchive; pushed: boolean }): string[] =>
        a.pushed ? [listsLine(a.made.record!)] : []
      if (c.owner !== 'git') {
        // What another plugin deletes inside a worktree is archived with it first.
        const made = worktreesHolding(c, ctx).flatMap((r) => sentence(archiveRepo(r, ctx)))
        return made.length > 0 ? made.join('; ') : undefined
      }
      const row = rowOf(c)
      // Not in `delete`: what cannot be archived must stop before another plugin acts on it.
      const archived = archiveRepo(row, ctx)
      const problem = archiveProblem(row, archived.made, runners)
      if (problem !== null) {
        throw new Error([problem, ...sentence(archived)].join('; '))
      }
      return archived.pushed ? sentence(archived)[0] : undefined
    },
    delete(c, ctx) {
      const row = rowOf(c)
      // `git worktree remove` follows a link, and would empty the folder it leads to.
      if (c.path !== undefined && lstatSync(c.path, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error(`git: ${c.path} is now a symlink; its worktree is not removed through it`)
      }
      const archived = archives.get(row.repo)
      if (opts.archive !== undefined && archived === undefined) {
        throw new Error(`git: ${c.id} was not prepared, so its work is not archived`)
      }
      const result = removeCandidate(row, {
        ...runners,
        cwd: ctx.cwd,
        archived,
        allow: ctx.allow.filter(isRisk),
      })
      if (!result.ok) throw new Error(result.error ?? 'failed')
      const held = archived?.record?.parents.some((p) => p.rows.includes(row.id)) === true
      return [
        ...(held ? [listsLine(archived!.record!)] : []),
        ...result.steps.map((s) => s.verification ?? s.command),
      ].join('; ')
    },
  })
}

/**
 * The `git` plugin as a definition, with no settings of its own.
 *
 * @param opts - Passed to `gitPlugin`. The command line passes `--worktrees`
 *   and `--branches` here as `sweep.only`, so no other plugin's `create` sees
 *   git's kinds. Copied here, so changing it afterwards changes no plugin the
 *   definition builds.
 */
export function gitDefinitionWith(opts: GitPluginOptions = {}): PluginDefinition {
  const own = copyOf(opts)
  return definePlugin({
    name: 'git',
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: () => gitPlugin(own),
  })
}

/** The `git` plugin's definition, sweeping worktrees and local branches. */
export const gitDefinition = gitDefinitionWith()

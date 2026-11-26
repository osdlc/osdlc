/**
 * The `git` plugin: repo-cleaner's sweep as candidates, its blockers and
 * risks as objections, `archiveCandidates` in `prepare`, and `removeCandidate`
 * as the delete.
 */

import { sep } from 'node:path'

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

import { FatalRun, type Candidate, type Ctx, type Objection, type Plugin } from './types.ts'

export interface GitPluginOptions extends Runners {
  /** What the sweep judges; the plugin sets `cwd` from the run. */
  sweep?: Pick<
    SweepOptions,
    'only' | 'remotes' | 'fetch' | 'offline' | 'against' | 'provider' | 'branch' | 'cacheDir'
  >
  /**
   * Archive unlanded work to the remote before deleting it: one archive per
   * repository, pushed in `prepare`. A failed archive push stops the run.
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

/** The name `--spare` knows a row by: a branch's name, or the branch a worktree has checked out. */
function nameOf(row: CleanCandidate): string | null {
  if (row.kind === 'branch') return row.path
  return row.kind === 'worktree' ? ((row.evidence as WorktreeEvidence).branch ?? null) : null
}

export function gitPlugin(opts: GitPluginOptions = {}): Plugin {
  /** The last discovery's rows, kept for the later phases; `discover` makes them afresh. */
  let rows = new Map<string, CleanCandidate>()
  /** The archive this run pushed for each repository, by its root; `discover` empties it. */
  const archives = new Map<string, CandidateArchive>()
  const runners = { git: opts.git, gh: opts.gh, glab: opts.glab, probe: opts.probe }
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
   * another plugin: their archive is made before `c` is touched.
   */
  const worktreesHolding = (c: Candidate, ctx: Ctx): CleanCandidate[] =>
    (ctx.run ?? []).flatMap((q) => {
      const r = q.owner === 'git' ? rows.get(q.id) : undefined
      return r?.kind === 'worktree' && mayContribute(r) && c.path.startsWith(`${r.path}${sep}`)
        ? [r]
        : []
    })

  return {
    name: 'git',
    detect: () => true,
    discover(ctx) {
      const found = candidatesOf(sweep(ctx.targets, { ...opts.sweep, ...runners, cwd: ctx.cwd }))
      rows = new Map(found.map((row) => [candidateId(row), row]))
      archives.clear()
      return found.map((row): Candidate => {
        const id = candidateId(row)
        return {
          id,
          kind: row.kind,
          path: row.kind === 'worktree' ? row.path : `${row.repo}:${row.path}`,
          ...(row.kind === 'worktree' ? {} : { at: row.repo }),
          ...(nameOf(row) === null ? {} : { name: nameOf(row)! }),
          owner: 'git',
          why: row.why,
          evidence: row.fingerprint,
          ...(row.requires === undefined ? {} : { requires: row.requires }),
          // The default run skips what is not `delete`.
          ...(row.verdict !== 'delete' ? { held: true } : {}),
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
        const unarchivable =
          opts.archive !== undefined && row.remote === null && mayContribute(row)
            ? [own('refuse', 'no-remote', noRemote(row.repo))]
            : []
        return [
          ...row.blockers.map((b) => own('refuse', b, `${row.why} (${b})`)),
          ...unarchivable,
          ...row.risks.map((r) => own('protest', r, `deleting it risks ${r}`)),
        ]
      })
    },
    prepare(c, ctx) {
      if (opts.archive === undefined) return
      const sentence = (a: { made: CandidateArchive; pushed: boolean }): string[] =>
        a.pushed ? [`${a.made.record!.ref} lists ${a.made.record!.sha}`] : []
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
        ...(held ? [`${archived!.record!.ref} lists ${archived!.record!.sha}`] : []),
        ...result.steps.map((s) => s.verification ?? s.command),
      ].join('; ')
    },
  }
}

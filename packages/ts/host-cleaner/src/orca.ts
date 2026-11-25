/**
 * The `orca` plugin: worktrees that the Orca app keeps a record of, and the
 * terminals and agents it holds open in them.
 *
 * Detected when the `orca` CLI is found (on `PATH`, or in the app bundle).
 * When the app is not running, or `orca status` fails or prints no JSON,
 * Orca's records cannot be read, so every `git` worktree under
 * {@link ORCA_WORKSPACES} is refused with `orca-unreachable` and the other
 * worktrees are left to `git`; `detect` gives the reason as its note.
 *
 * The `git` plugin owns a worktree, so it removes the directory. This plugin
 * objects first (an agent at work refuses; open terminals protest with
 * {@link CLOSE_TERMINALS}; every Orca worktree gets a note), closes the
 * terminals in `prepare`, and in `deleted` asks Orca to forget the record,
 * which `orca worktree rm` does and which would also delete the directory, so
 * it is only asked once the directory is gone. A record whose directory is
 * already gone is its own `orca-record` candidate, a ref to the record.
 * Settings: `plugins.orca.repos` (default true) adds the repositories Orca lists to the sweep.
 */

import { existsSync } from 'node:fs'

import { failureText, spawnRunner, which, type CommandRunner } from '@osdlc/command-seam'
import { z } from 'zod'

import { realOr } from './roots.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type Objection,
  type PathCandidate,
  type Plugin,
} from './types.ts'

export const ORCA_PLUGIN = 'orca'

/** The risk a person grants by name before the terminals in a worktree are closed. */
export const CLOSE_TERMINALS = 'close-terminals'

/** A path holding this is under Orca's workspaces folder, so the worktree is taken to be Orca's. */
export const ORCA_WORKSPACES = '/orca/workspaces/'

/** Where the desktop app puts its CLI when it is not on `PATH`. */
export const ORCA_BUNDLE_CLI = '/Applications/Orca.app/Contents/Resources/bin/orca'

/** Agent states that mean nothing is working. Any other state counts as busy. */
const QUIET_AGENT = new Set(['idle', 'done'])
/** Worktree statuses that mean nothing is working. Any other status counts as busy. */
const QUIET_STATUS = new Set(['', 'inactive', 'active', 'idle', 'done'])

const RECORD_LIMIT = 1000

export interface OrcaOptions {
  /** The runner for the `orca` CLI. When absent, the CLI is looked up and spawned. */
  orca?: CommandRunner | undefined
  /** Sweep the repositories `orca repo list` names. Default true. */
  repos?: boolean | undefined
  /** The environment the `orca` CLI is looked up in and run with, over this process's. */
  env?: Readonly<Record<string, string | undefined>> | undefined
}

/** One Orca-managed worktree, as `orca worktree ps --json` reports it. */
export interface OrcaRecord {
  /** `<repo id>::<path>`; what `id:` selects. */
  id: string
  path: string
  name: string
  main: boolean
  terminals: number
  /** Terminals Orca could not look into. */
  unverifiable: number
  /** The state of each agent. */
  agents: string[]
  status: string
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** The records in `orca worktree ps --json`; folder workspaces and rows without a path are left out. */
export function parseRecords(result: unknown): OrcaRecord[] {
  const rows = isObject(result) && Array.isArray(result.worktrees) ? result.worktrees : []
  return rows.flatMap((row): OrcaRecord[] => {
    if (!isObject(row) || (row.workspaceKind !== undefined && row.workspaceKind !== 'git'))
      return []
    const path = str(row.path)
    const id = str(row.worktreeId) || str(row.id)
    if (path === '' || id === '') return []
    const agents = (Array.isArray(row.agents) ? row.agents : []).map((a) =>
      isObject(a) ? str(a.state) || 'unknown' : 'unknown',
    )
    return [
      {
        id,
        path,
        name: str(row.displayName) || path,
        main: row.isMainWorktree === true,
        terminals: num(row.liveTerminalCount),
        unverifiable: num(row.unverifiableTerminalCount),
        agents,
        status: str(row.status),
      },
    ]
  })
}

/** Whether something in the worktree is at work, or cannot be told apart from work. */
export const busy = (r: OrcaRecord): boolean =>
  !QUIET_STATUS.has(r.status) || r.agents.some((state) => !QUIET_AGENT.has(state))

/** A git plugin's worktree row: the only candidates this plugin acts on. */
const isGitWorktree = (c: Candidate): c is PathCandidate =>
  c.kind === 'worktree' && c.owner === 'git' && c.path !== undefined

/** Whether `c` sits under Orca's workspaces folder, by its real path. */
const inWorkspaces = (c: PathCandidate): boolean => realOr(c.path).includes(ORCA_WORKSPACES)

/**
 * Orca worktrees as `orca-record:<path>` refs when their directory is
 * gone, notes, protests and refusals on `git`'s worktrees that Orca manages,
 * and Orca's record forgotten after `git` removed the worktree.
 */
export function orcaPlugin(options: OrcaOptions = {}): Plugin {
  const found = (): CommandRunner | undefined => {
    if (options.orca !== undefined) return options.orca
    const exe =
      which('orca', { env: options.env }) ??
      (existsSync(ORCA_BUNDLE_CLI) ? ORCA_BUNDLE_CLI : undefined)
    return exe === undefined ? undefined : spawnRunner(exe)
  }

  /** The `result` of `orca <args> --json`; throws with Orca's own message when it fails. */
  const call = (args: readonly string[], ctx: Ctx): unknown => {
    const runner = found()
    if (runner === undefined) throw new Error('the orca CLI was not found')
    const r = runner.run([...args, '--json'], { cwd: ctx.cwd, env: options.env })
    const reason = (): string => failureText(r) || r.error || `exit ${r.exitCode}`
    if (r.exitCode !== 0) throw new Error(`orca ${args.join(' ')} failed: ${reason()}`)
    let body: unknown
    try {
      body = JSON.parse(r.stdout)
    } catch {
      throw new Error(`orca ${args.join(' ')} printed no JSON`)
    }
    if (!isObject(body) || body.ok !== true) {
      const err = isObject(body) && isObject(body.error) ? str(body.error.message) : ''
      throw new Error(`orca ${args.join(' ')} failed: ${err || 'not ok'}`)
    }
    return body.result
  }

  const records = (ctx: Ctx): OrcaRecord[] => {
    const result = call(['worktree', 'ps', '--limit', String(RECORD_LIMIT)], ctx)
    // A worktree past the cap would read as not Orca's.
    if (isObject(result) && result.truncated === true) {
      throw new Error(`orca listed more than ${RECORD_LIMIT} worktrees`)
    }
    return parseRecords(result)
  }

  /** Set by `detect` to why Orca cannot be asked (not running, or its status unreadable); no call to Orca is made then. */
  let down: string | undefined

  /** The records seen at `prepare`, kept for `deleted`, since Orca may list less once git has removed the directory. */
  const prepared = new Map<string, OrcaRecord>()

  const recordFor = (c: PathCandidate, all: readonly OrcaRecord[]): OrcaRecord | undefined => {
    const real = realOr(c.path)
    return all.find((r) => !r.main && realOr(r.path) === real)
  }

  /** Asks Orca to forget `r`. `worktree rm` deletes the directory too, so it is never asked of one that exists. */
  const forget = (r: Pick<OrcaRecord, 'id' | 'path'>, ctx: Ctx): void => {
    if (existsSync(r.path)) throw new Error(`${r.path} still exists; Orca would delete it`)
    call(['worktree', 'rm', '--worktree', `id:${r.id}`, '--force'], ctx)
  }

  const own = (
    c: Candidate,
    level: Objection['level'],
    code: string,
    reason: string,
  ): Objection => ({
    by: ORCA_PLUGIN,
    candidate: c.id,
    level,
    code,
    reason,
  })

  return {
    name: ORCA_PLUGIN,
    detect(ctx) {
      down = undefined
      if (found() === undefined) return false
      let status: unknown
      try {
        status = call(['status'], ctx)
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err)
        down = `Orca's status could not be read (${why})`
        return { active: true, note: down }
      }
      const runtime = isObject(status) && isObject(status.runtime) ? status.runtime : {}
      if (runtime.reachable === true) return true
      down = 'Orca is installed but not running'
      return { active: true, note: down }
    },
    scope(ctx) {
      if (down !== undefined || options.repos === false) return []
      const repos = call(['repo', 'list'], ctx)
      const rows = isObject(repos) && Array.isArray(repos.repos) ? repos.repos : []
      return rows.flatMap((r) =>
        isObject(r) && (r.kind === undefined || r.kind === 'git') && existsSync(str(r.path))
          ? [str(r.path)]
          : [],
      )
    },
    discover(ctx) {
      if (down !== undefined) return []
      return records(ctx)
        .filter((r) => !r.main && !existsSync(r.path))
        .map((r): Candidate => ({
          id: `orca-record:${r.path}`,
          kind: 'orca-record',
          ref: r.id,
          at: r.path,
          owner: ORCA_PLUGIN,
          why: `Orca lists ${r.name}, whose directory is gone`,
          held: true,
          evidence: { kind: 'orca-record', orcaId: r.id, path: r.path },
        }))
    },
    object(all, ctx) {
      const worktrees = all.filter(isGitWorktree)
      if (worktrees.length === 0) return []
      if (down !== undefined) {
        const why = down
        // No fallback to git: a worktree Orca may hold open is not taken while it cannot be asked.
        return worktrees
          .filter(inWorkspaces)
          .map((c) =>
            own(
              c,
              'refuse',
              'orca-unreachable',
              `${why}, and ${c.path} is under its workspaces folder`,
            ),
          )
      }
      let seen: OrcaRecord[]
      try {
        seen = records(ctx)
      } catch (err) {
        // A worktree might be Orca's and cannot be told; none is taken meanwhile.
        const why = err instanceof Error ? err.message : String(err)
        return worktrees.map((c) => own(c, 'refuse', 'orca-unreachable', why))
      }
      return worktrees.flatMap((c): Objection[] => {
        const r = recordFor(c, seen)
        if (r === undefined) return []
        const out = [own(c, 'note', 'orca-managed', `Orca manages it as ${r.name} (${r.id})`)]
        if (busy(r)) {
          out.push(
            own(
              c,
              'refuse',
              'orca-agent-active',
              `an agent is at work in it in Orca (${r.agents.join(', ') || r.status})`,
            ),
          )
        }
        if (r.unverifiable > 0) {
          out.push(
            own(
              c,
              'refuse',
              'orca-terminal-unverifiable',
              `${r.unverifiable} Orca terminal(s) cannot be inspected`,
            ),
          )
        }
        if (r.terminals > 0) {
          out.push(
            own(c, 'protest', CLOSE_TERMINALS, `closes ${r.terminals} open Orca terminal(s)`),
          )
        }
        return out
      })
    },
    prepare(c, ctx) {
      if (!isGitWorktree(c)) return
      if (down !== undefined) {
        if (inWorkspaces(c)) throw new Error(`${down}, and ${c.path} may be its worktree`)
        return
      }
      const r = recordFor(c, records(ctx))
      if (r === undefined) return
      // An agent may have started since `object`.
      if (busy(r)) throw new Error(`an agent is now at work in ${c.path} in Orca`)
      prepared.set(c.id, r)
      if (r.terminals > 0) call(['terminal', 'close', '--worktree', `id:${r.id}`, '--all'], ctx)
    },
    delete(c, ctx) {
      if (c.ref === undefined || c.at === undefined)
        throw new Error(`${c.id} is not an Orca record`)
      // `git` may already have had Orca forget a prunable worktree of the same path.
      if (!records(ctx).some((r) => r.id === c.ref)) return `Orca no longer lists ${c.at}`
      forget({ id: c.ref, path: c.at }, ctx)
      return `orca worktree rm forgot ${c.ref}`
    },
    deleted(c, ctx) {
      if (!isGitWorktree(c)) return
      const r = prepared.get(c.id)
      prepared.delete(c.id)
      if (r !== undefined) forget(r, ctx)
    },
  }
}

/** The `orca` plugin as the command line builds it. Settings: `repos`. */
export const orcaDefinition = definePlugin({
  name: ORCA_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({
    repos: z
      .boolean()
      .default(true)
      .describe('Sweep the repositories `orca repo list` names, as if they were in `targets`.'),
  }),
  create: ({ settings, env }) => orcaPlugin({ repos: settings.repos, env }),
})

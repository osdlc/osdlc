/**
 * The `orca` adapter: worktrees that Orca manages are removed through Orca.
 *
 * Detected when the Orca CLI runs: the app bundle's copy at
 * `/Applications/Orca.app/Contents/Resources/bin/orca` first, then `orca` on
 * `PATH`. It reads `orca worktree list`, `orca terminal list` and
 * `orca repo list`, all with `--json`, and every call goes through
 * `@osdlc/command-seam`.
 *
 * - `annotate` adds a note to each worktree Orca lists: its Orca id and its
 *   open terminals.
 * - `removeWorktree` closes those terminals, then removes the worktree
 *   through Orca, in place of `git worktree remove`.
 * - `discover` adds every git repository Orca lists to the sweep.
 * - With the runtime unreachable, a removable worktree under an
 *   `orca/workspaces/` directory is `blocked` with `host:orca-unreachable`:
 *   a plain git removal would leave Orca's record and terminals behind.
 */

import { existsSync, realpathSync } from 'node:fs'

import {
  runJson,
  shellJoin,
  spawnRunner,
  type CommandRunner,
  type JsonRun,
} from '@osdlc/command-seam'
import type { Annotate, HostBlocker, RemoveWorktree, Row, WorktreeRow } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import type { HostAdapter } from './adapter.ts'

export const ORCA_ADAPTER = 'orca'

/** Where the Orca app bundle keeps its CLI. */
export const ORCA_BUNDLE_CLI = '/Applications/Orca.app/Contents/Resources/bin/orca'

/** The blocker on a worktree that may be Orca's while Orca cannot be asked. */
export const ORCA_UNREACHABLE: HostBlocker = 'host:orca-unreachable'

/** Where Orca puts the worktrees it creates by default. */
const ORCA_WORKSPACES = /\/orca\/workspaces\//

/** More rows than any one machine has, so that `--limit` never truncates. */
const LIMIT = '100000'

const Worktrees = z.object({
  ok: z.literal(true),
  result: z.object({
    truncated: z.boolean(),
    worktrees: z.array(
      z.object({
        id: z.string(),
        path: z.string(),
        isMainWorktree: z.boolean(),
        displayName: z.string(),
      }),
    ),
  }),
})

const Terminals = z.object({
  ok: z.literal(true),
  result: z.object({
    truncated: z.boolean(),
    terminals: z.array(z.object({ worktreePath: z.string() })),
  }),
})

const Repos = z.object({
  ok: z.literal(true),
  result: z.object({ repos: z.array(z.object({ path: z.string(), kind: z.string() })) }),
})

/** One worktree as Orca lists it. */
export interface OrcaWorktree {
  /** `<repo id>::<path>`, Orca's id for it. */
  id: string
  path: string
  displayName: string
  terminals: number
}

export interface OrcaOptions {
  /** A runner for `binary`. Default: the real process. */
  command?: ((binary: string) => CommandRunner) | undefined
  /** Whether a file exists. Default: the file system. */
  exists?: ((path: string) => boolean) | undefined
}

/** A path with symlinks resolved, so Orca's spelling and git's compare equal. */
const canon = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const parseWith =
  <T>(schema: z.ZodType<T>) =>
  (value: unknown): T =>
    schema.parse(value)

/** The one line to say about a failed command. */
function failure(run: { stdout: string; stderr: string; error?: string | undefined }): string {
  const text = (run.stderr.trim() || run.stdout.trim() || run.error || 'no output').split('\n')[0]
  return text ?? 'no output'
}

/**
 * The adapter, with the runner and the file check injected for tests.
 * `orcaAdapter` is this with the real ones.
 */
export function createOrcaAdapter(options: OrcaOptions = {}): HostAdapter {
  const spawn = options.command ?? ((binary: string) => spawnRunner(binary))
  const exists = options.exists ?? existsSync
  const cwd = process.cwd()
  let found: { binary: string; runner: CommandRunner } | null = null

  const works = (binary: string): CommandRunner | null => {
    try {
      const runner = spawn(binary)
      return runner.run(['--version'], { cwd }).exitCode === 0 ? runner : null
    } catch {
      return null
    }
  }

  /** The first working CLI: the bundle's, then `orca` on PATH. */
  const cli = (): { binary: string; runner: CommandRunner } | null => {
    if (found !== null) return found
    for (const binary of exists(ORCA_BUNDLE_CLI) ? [ORCA_BUNDLE_CLI, 'orca'] : ['orca']) {
      const runner = works(binary)
      if (runner !== null) {
        found = { binary, runner }
        return found
      }
    }
    return null
  }

  const json = <T>(argv: string[], schema: z.ZodType<T>): JsonRun<T> | null => {
    const orca = cli()
    return orca === null ? null : runJson(orca.runner, argv, { cwd, parse: parseWith(schema) })
  }

  /** Orca's worktrees by path, or null when Orca cannot be asked. */
  const listing = (): Map<string, OrcaWorktree> | null => {
    const worktrees = json(['worktree', 'list', '--json', '--limit', LIMIT], Worktrees)
    const terminals = json(['terminal', 'list', '--json', '--limit', LIMIT], Terminals)
    if (worktrees?.ok !== true || terminals?.ok !== true) return null
    if (worktrees.value.result.truncated || terminals.value.result.truncated) return null
    const open = new Map<string, number>()
    for (const t of terminals.value.result.terminals) {
      const key = canon(t.worktreePath)
      open.set(key, (open.get(key) ?? 0) + 1)
    }
    const out = new Map<string, OrcaWorktree>()
    for (const w of worktrees.value.result.worktrees) {
      if (w.isMainWorktree) continue
      out.set(canon(w.path), {
        id: w.id,
        path: w.path,
        displayName: w.displayName,
        terminals: open.get(canon(w.path)) ?? 0,
      })
    }
    return out
  }

  const noteFor = (w: OrcaWorktree): string =>
    `Orca manages this worktree (${w.displayName}, id ${w.id}) and has ${w.terminals} open ${
      w.terminals === 1 ? 'terminal' : 'terminals'
    } in it; removing it closes them and removes it through Orca.`

  const annotate: Annotate = (_repo, rows) => {
    const listed = listing()
    return rows.map((row): Row => {
      if (row.kind !== 'worktree' || row.evidence.primary) return row
      if (listed === null) {
        if (row.action !== 'remove' || !ORCA_WORKSPACES.test(row.evidence.path)) return row
        return {
          ...row,
          verdict: 'blocked',
          blockers: [...row.blockers, ORCA_UNREACHABLE],
          action: null,
          commands: [],
          notes: [
            ...row.notes,
            'This worktree is probably managed by Orca, which cannot be reached: start Orca and sweep again. A plain git removal would leave its record and terminals behind.',
          ],
        }
      }
      const managed = listed.get(canon(row.evidence.path))
      return managed === undefined ? row : { ...row, notes: [...row.notes, noteFor(managed)] }
    })
  }

  const removeWorktree: RemoveWorktree = (row: WorktreeRow, ctx) => {
    const orca = cli()
    if (orca === null) return null
    const listed = listing()
    if (listed === null) {
      // Orca went away after the sweep: fail closed rather than fall back to git.
      if (!ORCA_WORKSPACES.test(row.evidence.path)) return null
      return {
        command: shellJoin([
          orca.binary,
          'worktree',
          'rm',
          '--worktree',
          `path:${row.evidence.path}`,
        ]),
        run() {
          throw new Error('Orca cannot be reached, so the worktree is not removed with git')
        },
      }
    }
    const managed = listed.get(canon(row.evidence.path))
    if (managed === undefined) return null
    const selector = `path:${managed.path}`
    const close = ['terminal', 'close', '--worktree', selector, '--all']
    const remove = ['worktree', 'rm', '--worktree', selector, ...(ctx.force ? ['--force'] : [])]
    const show = (argv: string[]): string => shellJoin([orca.binary, ...argv])
    const step = (argv: string[]): void => {
      const run = orca.runner.run(argv, { cwd: ctx.repo })
      if (run.exitCode !== 0) throw new Error(`${show(argv)} failed: ${failure(run)}`)
    }
    return {
      command: `${show(close)} && ${show(remove)}`,
      run() {
        step(close)
        step(remove)
      },
    }
  }

  return {
    name: ORCA_ADAPTER,
    detect: () => cli() !== null,
    annotate,
    removeWorktree,
    discover() {
      const repos = json(['repo', 'list', '--json'], Repos)
      if (repos?.ok !== true) return []
      return repos.value.result.repos
        .filter((r) => r.kind === 'git' && exists(r.path))
        .map((r) => r.path)
    },
  }
}

export const orcaAdapter: HostAdapter = createOrcaAdapter()

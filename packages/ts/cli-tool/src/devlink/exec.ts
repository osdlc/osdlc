/**
 * The JavaScript launcher, for a tool whose canonical install is an npm bin
 * shim rather than a bash script. The shim resolves. When a checkout other
 * than its own is selected, it hands the process over to that checkout's
 * source under Bun. When a project's installed copy is selected, it runs that
 * copy's bin under the runtime its `#!` line names, given the bin's path, so
 * on Windows no `.cmd` shim is involved.
 *
 * On POSIX the hand-off replaces this process with `process.execve`, as the
 * bash launcher does with `exec`. A spawned child cannot be given the
 * parent's signals: a SIGTERM to the parent orphans it, and Ctrl-C gives the
 * shell its prompt back while the child still runs. One process, with the
 * same pid, has neither problem, and its exit status is the child's own.
 * Where `execve` is missing (Windows, Node before 23.11) a synchronous spawn
 * whose exit code becomes this process's is the fallback.
 *
 * This does not go through `@osdlc/command-seam`, on purpose. The program
 * started inherits stdio and is the program the user invoked, so nothing is
 * captured.
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { writeSync } from 'node:fs'
import { devNull, constants as osConstants } from 'node:os'

import { which } from '@osdlc/command-seam'

import type { Selected, Selection } from './resolve.ts'
import { launchLayerVar, projectVar, quietVar, type ToolSpec } from './spec.ts'

/**
 * Bun's flags for running a checkout's entry from any cwd. Bun reads `.env*`
 * and `bunfig.toml` from the cwd, which is often a repository the user does
 * not control: a `.env` sets the process environment and a `bunfig.toml`
 * `preload` runs its code first. `--no-env-file` stops the first. An empty
 * config file stops the second; Bun has no flag that turns config off, and
 * passing the checkout's own `bunfig.toml` would not help, because Bun
 * resolves the paths inside it against the cwd. Both flags must come before
 * `run`, which reads its own flags differently.
 */
export function bunRunArgs(entry: string, nullFile: string = devNull): string[] {
  return ['--no-env-file', `--config=${nullFile}`, 'run', entry]
}

/**
 * Options for running the selected checkout: the environment, the line
 * announcing what runs, and the `bun` binary.
 * @experimental
 */
export interface ExecOptions {
  env?: Record<string, string | undefined>
  /** Writes the "running X (why)" line. Defaults to stderr. */
  announce?: (line: string) => void
  /**
   * The version of the copy that is running, or null when it is not known.
   * A hand-off to a project's copy of the same version runs silently.
   */
  version?: string | null
  /**
   * The `node` to run a project's bin with, used as given. Defaults to this
   * process's own binary under Node, else the `node` found as `bun` is.
   */
  node?: string
  /**
   * The `bun` to run, used as given. Defaults to the `bun` found on the
   * absolute entries of `env`'s `PATH`. A relative entry is skipped, and so
   * is the cwd, so a `bun` in the repository the user stands in never runs.
   */
  bun?: string
  /**
   * Replaces this process with `file`, as `process.execve` does. Defaults to
   * `process.execve` outside Windows when it exists; when it is missing the
   * hand-off is a synchronous spawn instead. A stand-in that returns makes
   * the hand-off return 0. Given as `undefined`, the hand-off is always a spawn.
   */
  execve?: ((file: string, args: string[], env: Record<string, string>) => void) | undefined
}

/**
 * Run `argv` against the selected checkout's entry and return the exit code
 * to set on `process.exitCode`. A `local` selection returns null, and the
 * caller runs its own code.
 * @experimental
 */
export function execSelection(
  spec: ToolSpec,
  selection: Selection,
  argv: readonly string[],
  opts: ExecOptions = {},
): number | null {
  if (selection.source === 'local') return null
  const env = opts.env ?? process.env
  const announce = opts.announce ?? writeStderr
  if (env[quietVar(spec)] !== '1' && !sameVersion(selection, opts.version)) {
    announce(`${spec.name}: running ${selection.entry} (${reasonLine(selection, opts.version)})`)
  }
  // The layer that chose it, as the bash launcher exports it, so the started
  // process knows it was handed off and runs its own code.
  const childEnv = { ...env, [launchLayerVar(spec)]: selection.source }
  if (selection.runtime === 'node') {
    const node = opts.node ?? defaultNode(env)
    if (node === undefined) {
      announce(
        `${spec.name}: the project's copy at ${selection.checkout} needs node on an absolute PATH entry. ` +
          `Install Node, or set ${projectVar(spec)}=0 to use this install.`,
      )
      return 1
    }
    return run(node, [selection.entry, ...argv], childEnv, opts, (why) =>
      announce(
        `${spec.name}: the project's copy at ${selection.checkout} could not start ${node} (${why}). ` +
          `Set ${projectVar(spec)}=0 to use this install.`,
      ),
    )
  }
  const bun =
    opts.bun ??
    which('bun', { absolutePathOnly: true, env: { PATH: env['PATH'], PATHEXT: env['PATHEXT'] } })
  // A project copy whose `#!` names bun is not a checkout, and `dev off` does not affect it.
  const what =
    selection.source === 'project'
      ? `the project's copy at ${selection.checkout} runs under bun and`
      : 'the selected checkout runs from source and'
  const fix =
    selection.source === 'project'
      ? `Install Bun (https://bun.sh), or set ${projectVar(spec)}=0 to use this install.`
      : `Install Bun (https://bun.sh), or run '${spec.name} dev off' to use the local install.`
  if (bun === undefined) {
    announce(`${spec.name}: ${what} needs bun on an absolute PATH entry. ${fix}`)
    return 1
  }
  return run(bun, [...bunRunArgs(selection.entry), ...argv], childEnv, opts, (why) =>
    announce(`${spec.name}: ${what} could not start ${bun} (${why}). ${fix}`),
  )
}

/**
 * The "running X" line, written before `execve` replaces the process, so it
 * is written synchronously: a `process.stderr.write` still queued on a pipe
 * is lost.
 */
function writeStderr(line: string): void {
  writeSync(2, `${line}\n`)
}

function defaultExecve(): ExecOptions['execve'] {
  const execve = process.execve
  if (process.platform === 'win32' || typeof execve !== 'function') return undefined
  return (file, args, env) => execve(file, args, env)
}

/**
 * Hand the run to `file`: replace this process when `execve` is available,
 * else spawn it and wait. Returns only when it could not start, or after the
 * spawned fallback ends.
 */
function run(
  file: string,
  args: readonly string[],
  env: Record<string, string | undefined>,
  opts: ExecOptions,
  failed: (why: string) => void,
): number {
  const execve = 'execve' in opts ? opts.execve : defaultExecve()
  if (execve !== undefined) {
    const strings = Object.fromEntries(
      Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined),
    )
    try {
      execve(file, [file, ...args], strings)
    } catch (error) {
      // ENOENT or EACCES: execve(2) failed and this process is still here.
      failed(error instanceof Error ? error.message : String(error))
      return 1
    }
    return 0
  }
  const result = spawnSync(file, args, { stdio: 'inherit', env: env as NodeJS.ProcessEnv })
  return finish(result, failed)
}

/** A project hand-off to a copy of the version that is running says nothing. */
function sameVersion(selection: Selected, running: string | null | undefined): boolean {
  return (
    selection.source === 'project' && typeof running === 'string' && selection.version === running
  )
}

function reasonLine(selection: Selected, running: string | null | undefined): string {
  if (selection.source !== 'project') return selection.reason
  const theirs = selection.version ?? 'unknown version'
  const ours = typeof running === 'string' ? running : 'unknown'
  return `${selection.reason}, ${theirs}; this install is ${ours}`
}

function defaultNode(env: Record<string, string | undefined>): string | undefined {
  if (process.versions['bun'] === undefined) return process.execPath
  return which('node', {
    absolutePathOnly: true,
    env: { PATH: env['PATH'], PATHEXT: env['PATHEXT'] },
  })
}

/**
 * The exit code of the spawned fallback, or 1 after `failed` when it could not
 * start. A signal sent to this process is not forwarded to the child, which
 * is why the spawn is only the fallback.
 */
function finish(result: SpawnSyncReturns<Buffer>, failed: (why: string) => void): number {
  if (result.error !== undefined) {
    failed(result.error.message)
    return 1
  }
  if (result.status === null) {
    // The shell convention for a signalled child: 128 + the signal number.
    const num = result.signal === null ? undefined : osConstants.signals[result.signal]
    return 128 + (num ?? 0)
  }
  return result.status
}

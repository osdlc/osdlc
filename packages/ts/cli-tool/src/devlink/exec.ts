/**
 * The JavaScript launcher, for a tool whose canonical install is an npm bin
 * shim rather than a bash script. The shim resolves. When a checkout other
 * than its own is selected, it hands the process over to that checkout's
 * source under Bun.
 *
 * This spawn does not go through `@osdlc/command-seam`, on purpose. The child
 * inherits stdio and is the program the user invoked, so nothing is captured.
 * The closest thing to `exec` a JavaScript process has is a synchronous spawn
 * whose exit code becomes its own.
 */

import { spawnSync } from 'node:child_process'
import { devNull, constants as osConstants } from 'node:os'

import { which } from '@osdlc/command-seam'

import type { Selection } from './resolve.ts'
import { launchLayerVar, quietVar, type ToolSpec } from './spec.ts'

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
   * The `bun` to run, used as given. Defaults to the `bun` found on the
   * absolute entries of `env`'s `PATH`. A relative entry is skipped, and so
   * is the cwd, so a `bun` in the repository the user stands in never runs.
   */
  bun?: string
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
  const announce = opts.announce ?? ((line: string) => process.stderr.write(`${line}\n`))
  if (env[quietVar(spec)] !== '1') {
    announce(`${spec.name}: running ${selection.entry} (${selection.reason})`)
  }
  const bun =
    opts.bun ??
    which('bun', { absolutePathOnly: true, env: { PATH: env['PATH'], PATHEXT: env['PATHEXT'] } })
  if (bun === undefined) {
    announce(
      `${spec.name}: the selected checkout runs from source and needs bun on an absolute PATH entry. ` +
        `Install Bun (https://bun.sh), or run '${spec.name} dev off' to use the local install.`,
    )
    return 1
  }
  // The layer that chose it, as the bash launcher exports it, so the started
  // process knows it was handed off and runs its own code.
  const childEnv = { ...env, [launchLayerVar(spec)]: selection.source }
  const result = spawnSync(bun, [...bunRunArgs(selection.entry), ...argv], {
    stdio: 'inherit',
    env: childEnv as NodeJS.ProcessEnv,
  })
  if (result.error !== undefined) {
    announce(
      `${spec.name}: the selected checkout runs from source and could not start ${bun} (${result.error.message}). ` +
        `Install Bun (https://bun.sh), or run '${spec.name} dev off' to use the local install.`,
    )
    return 1
  }
  if (result.status === null) {
    // The shell convention for a signalled child: 128 + the signal number.
    const num = result.signal === null ? undefined : osConstants.signals[result.signal]
    return 128 + (num ?? 0)
  }
  return result.status
}

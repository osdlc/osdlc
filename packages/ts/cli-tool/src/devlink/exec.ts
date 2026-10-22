/**
 * The JavaScript door of the launcher: for a tool whose canonical install is
 * an npm bin shim rather than a bash script. The shim resolves, and when a
 * checkout other than itself is selected, hands the process over to that
 * checkout's source under Bun.
 *
 * This is a documented exception to the command seam: the child inherits
 * stdio and IS the program the user invoked, so nothing is captured. The
 * closest thing to `exec` a JavaScript process has is a synchronous spawn
 * whose exit code becomes its own.
 */

import { spawnSync } from 'node:child_process'
import { constants as osConstants } from 'node:os'

import type { Selection } from './resolve.ts'
import { quietVar, type ToolSpec } from './spec.ts'

/**
 * Options for running the selected checkout: the environment, the line announcing what runs and the `bun` binary.
 * @experimental
 */
export interface ExecOptions {
  env?: Record<string, string | undefined>
  /** Writes the "running X (why)" line; defaults to stderr. */
  announce?: (line: string) => void
  /** Defaults to `bun`. */
  bun?: string
}

/**
 * Run `argv` against the selected checkout's entry and return the exit code
 * to set on `process.exitCode`. A `local` selection returns null: the caller
 * runs its own code.
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
  const result = spawnSync(opts.bun ?? 'bun', ['run', selection.entry, ...argv], {
    stdio: 'inherit',
    env: env as NodeJS.ProcessEnv,
  })
  if (result.error !== undefined) {
    announce(
      `${spec.name}: the selected checkout runs from source and needs bun on PATH (${result.error.message}). ` +
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

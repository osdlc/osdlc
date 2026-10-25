/**
 * What a runner passes to `spawn` for a binary and argv. On POSIX that is
 * the binary and argv unchanged. On Windows a `.cmd` or `.bat` file cannot
 * be spawned directly (Node refuses with `EINVAL`), so it runs through
 * `cmd.exe` with each argument quoted for it.
 */

import { cmdArg, cmdCommand } from './quote.ts'
import type { EnvOverrides } from './sync.ts'
import { which } from './which.ts'

/** The `spawn` arguments for one run. */
export interface SpawnPlan {
  file: string
  args: string[]
  /** Set for a `cmd.exe` line, which is already quoted. */
  windowsVerbatimArguments?: true
}

/** An `npm`-style shim, whose `%*` makes `cmd.exe` parse the arguments twice. */
const NPM_SHIM = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i

/**
 * The plan for running `binary` with `argv`, or a spawn error message when
 * the arguments cannot be passed safely. A binary not found on Windows is
 * spawned as given, so the spawn reports `ENOENT` as it does on POSIX.
 *
 * @param opts.platform - Default `process.platform`; tests pass `'win32'`.
 * @param opts.comspec - The `cmd.exe` to use. Default `ComSpec`, else `cmd.exe`.
 */
export function spawnPlan(
  binary: string,
  argv: readonly string[],
  opts: {
    cwd: string
    env?: EnvOverrides | undefined
    platform?: NodeJS.Platform | undefined
    comspec?: string | undefined
  },
): SpawnPlan | { refusal: string } {
  const platform = opts.platform ?? process.platform
  if (platform !== 'win32') return { file: binary, args: [...argv] }
  const resolved = which(binary, { cwd: opts.cwd, env: opts.env, platform })
  if (resolved === undefined) return { file: binary, args: [...argv] }
  if (!/\.(cmd|bat)$/i.test(resolved)) return { file: resolved, args: [...argv] }
  const broken = argv.findIndex((a) => /[\r\n]/.test(a))
  if (broken !== -1) {
    return {
      refusal: `spawn ${binary} EINVAL: argv[${broken}] holds a line break, which cmd.exe cannot pass to a batch file`,
    }
  }
  const twice = NPM_SHIM.test(resolved)
  const line = [cmdCommand(resolved), ...argv.map((a) => cmdArg(a, twice))].join(' ')
  return {
    file: opts.comspec ?? process.env['ComSpec'] ?? 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    windowsVerbatimArguments: true,
  }
}

/** The `spawn` option a plan needs beyond its file and args. */
export function planOptions(plan: SpawnPlan): { windowsVerbatimArguments?: true } {
  return plan.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}
}

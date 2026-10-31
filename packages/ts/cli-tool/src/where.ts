/**
 * `<tool> --where`, which `runMain` answers: the file that is running, the
 * checkout or install it belongs to, and, with devlink, which layer chose it.
 *
 * Only `node:` imports, so the devlink entry can use {@link installDir}
 * without loading the root's runtime.
 */

import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import type { DevlinkWhere } from './run-main.ts'

/** The realpath of `path`, or null when it does not exist. */
export function realPath(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/**
 * The package directory an installed file belongs to: the directory under
 * the last `node_modules` segment of `real` (two levels for a scoped name).
 * Null when `real` does not go through `node_modules`.
 */
export function installDir(real: string): string | null {
  const segments = real.split(sep)
  const at = segments.lastIndexOf('node_modules')
  if (at === -1) return null
  const scoped = segments[at + 1]?.startsWith('@') === true
  return segments.slice(0, Math.min(segments.length, at + (scoped ? 3 : 2))).join(sep)
}

/** The nearest directory at or above `start` that holds a `package.json`, or null. */
function packageDir(start: string): string | null {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * A bun-compiled binary sees its entry at a virtual path: `/$bunfs/...` on
 * POSIX, `B:/~BUN/...` on Windows.
 */
function isCompiledScript(script: string): boolean {
  return /^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(script)
}

/** What `--where --json` prints. */
export interface Where {
  name: string
  version: string | null
  /** The realpath of the running script, or of the binary when it is compiled. Null when unknown. */
  file: string | null
  /** True for a bun-compiled binary, whose script path is virtual. */
  compiled: boolean
  from: {
    /**
     * `checkout`: devlink found the tool's checkout above the file.
     * `install`: the file is under `node_modules`, and `path` is the package.
     * `package`: neither, and `path` is the nearest `package.json` directory.
     * `unknown`: no `package.json` above the file.
     */
    kind: 'checkout' | 'install' | 'package' | 'unknown'
    path: string | null
  }
  /** Null without devlink. */
  chosenBy: DevlinkWhere | null
}

/** The inputs to {@link where}. */
export interface WhereInput {
  name: string
  version?: string | undefined
  script: string | undefined
  execPath: string
  devlink: DevlinkWhere | null
}

/** Work out the facts `--where` reports. */
export function where(input: WhereInput): Where {
  const compiled = input.script !== undefined && isCompiledScript(input.script)
  const running = compiled ? input.execPath : input.script
  const file = running === undefined ? null : (realPath(running) ?? resolve(running))
  const install = file === null ? null : installDir(file)
  const checkout = input.devlink?.checkout ?? null
  const from: Where['from'] =
    checkout !== null
      ? { kind: 'checkout', path: checkout }
      : install !== null
        ? { kind: 'install', path: install }
        : packageFrom(file)
  return {
    name: input.name,
    version: input.version ?? null,
    file,
    compiled,
    from,
    chosenBy: input.devlink,
  }
}

function packageFrom(file: string | null): Where['from'] {
  const dir = file === null ? null : packageDir(dirname(file))
  return dir === null ? { kind: 'unknown', path: null } : { kind: 'package', path: dir }
}

/** The text form of {@link Where}: one fact a line, labels padded to one column. */
export function renderWhere(w: Where): string {
  const lines = [w.version === null ? w.name : `${w.name} ${w.version}`]
  const file = w.file ?? 'unknown'
  lines.push(`file      ${w.compiled ? `${file} (compiled binary)` : file}`)
  const from =
    w.from.kind === 'install'
      ? `install ${w.from.path}`
      : w.from.kind === 'checkout'
        ? `checkout ${w.from.path}`
        : w.from.kind === 'package'
          ? `package ${w.from.path} (not in node_modules)`
          : 'unknown (no package.json above the file)'
  lines.push(`from      ${from}`)
  if (w.chosenBy !== null) lines.push(`chosen by ${w.chosenBy.text}`)
  return `${lines.join('\n')}\n`
}

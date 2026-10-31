/**
 * Which checkout a launcher should run, and why.
 *
 * Five layers. The first that matches wins:
 *
 *   env    `<NAME>_HOME` names a checkout by absolute path. It is explicit,
 *          so it always applies, even when a suppressor is set. A relative
 *          value is ignored: it would name a different directory, maybe the
 *          repository you stand in, every time you `cd`.
 *   cwd    the cwd is inside a checkout of this tool, so run that source.
 *          Only when the spec sets `cwdLayer`. Off when a suppressor is set
 *          or `<NAME>_CWD_DEV=0`.
 *   link   the `home` file names a checkout. Off when a suppressor is set.
 *   project
 *          a project above the cwd has this package in its `node_modules`,
 *          so run that copy's bin, as `npx` would: a project pins the
 *          version it uses. Only when the spec sets `packageName` and not
 *          `projectLayer: false`. Off when a suppressor is set or
 *          `<NAME>_PROJECT=0`. The copy that is already running is `local`.
 *          It is found as Node's `require` would find it, from the cwd.
 *   local  none of the above. The launcher runs the code next to it, which
 *          is the canonical install.
 *
 * A layer that names an invalid checkout (no marker, or the wrong
 * `package.json` name when the spec sets `packageName`) is skipped, not an
 * error. A deleted checkout must not break the installed tool. A layer that
 * names the launcher's own checkout resolves to `local`, so a link to the
 * installed checkout never re-execs itself.
 *
 * `renderLauncher` writes the same checks in bash for a launcher that has to
 * decide before any JavaScript runtime exists. `tests/devlink/launcher.test.ts`
 * checks that the two give the same answer. The bash launcher has no project
 * layer: it cannot read JSON, so it cannot find the package or its bin.
 */

import { closeSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path'

import { readActive, type StateOptions } from './state.ts'
import { cwdLayerActive, entryOf, homeVar, projectLayerActive, type ToolSpec } from './spec.ts'

/**
 * Which layer picked the checkout: `env`, `cwd`, `link`, `project`, or `local`
 * when none did.
 * @experimental
 */
export type Source = 'env' | 'cwd' | 'link' | 'project' | 'local'

/**
 * A selection that picked a checkout, with the file to run and the reason it
 * won.
 * @experimental
 */
export interface Selected {
  source: 'env' | 'cwd' | 'link' | 'project'
  /** The checkout root that won; for `project`, the installed package's directory. */
  checkout: string
  /** `<checkout>/<entry>`: what to run under Bun; for `project`, the package's bin. */
  entry: string
  /** Why, for the launcher's stderr line. */
  reason: string
  /**
   * For `project`: what runs the bin, from its `#!` line (`bun` when it names
   * bun, else `node`). Absent for a checkout, whose source runs under Bun.
   */
  runtime?: 'bun' | 'node'
  /** For `project`: the installed package's version, or null when it has none. */
  version?: string | null
}

/**
 * The selection that means no checkout was chosen, so the installed copy runs.
 * @experimental
 */
export interface Local {
  source: 'local'
  checkout: null
  entry: null
  reason: string
  /**
   * A line for stderr: the project declares this package but has no
   * installed copy, so the global copy runs.
   */
  hint?: string
}

/**
 * The result of picking a checkout: either a checkout to run or the installed
 * copy.
 * @experimental
 */
export type Selection = Selected | Local

/**
 * Options for picking a checkout: the working directory, the environment and
 * the launcher's own checkout.
 * @experimental
 */
export interface ResolveOptions extends StateOptions {
  /** Defaults to `process.cwd()`. */
  cwd?: string
  /** Defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /**
   * The checkout root the running launcher belongs to, or null for a launcher
   * that is not inside one (an npm install). A layer naming this checkout
   * resolves to `local`.
   */
  self?: string | null
  /**
   * The installed package directory the running script belongs to, or null
   * when it does not run from `node_modules`. A project layer naming this
   * directory resolves to `local`.
   */
  selfInstall?: string | null
}

/**
 * True when `dir` carries the tool's marker as a file (following symlinks),
 * the same test as the launcher's `[ -f ]`. When the spec sets
 * `packageName`, `dir/package.json` must also have that `name`.
 *
 * @experimental
 */
export function isCheckout(spec: ToolSpec, dir: string): boolean {
  try {
    if (!statSync(join(dir, spec.marker)).isFile()) return false
  } catch {
    return false
  }
  if (spec.packageName === undefined) return true
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    return (
      typeof pkg === 'object' &&
      pkg !== null &&
      (pkg as { name?: unknown }).name === spec.packageName
    )
  } catch {
    return false
  }
}

/**
 * The checkout `start` is inside, walking up to the filesystem root. Null when
 * there is none.
 *
 * @experimental
 */
export function cwdCheckout(spec: ToolSpec, start: string): string | null {
  let dir = resolvePath(start)
  for (;;) {
    if (isCheckout(spec, dir)) return dir
    const parent = resolvePath(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * The real directory of `packageName` as Node would resolve it from `start`:
 * the nearest `node_modules` at or above it, following a pnpm symlink into
 * its store. Its `package.json` must have that `name`. Null when there is
 * none.
 *
 * @internal
 */
export function projectInstall(spec: ToolSpec, start: string): string | null {
  const name = spec.packageName
  if (name === undefined) return null
  let from: string
  try {
    from = realpathSync(start)
  } catch {
    return null
  }
  const req = createRequire(join(from, 'noop.js'))
  const found = (dir: string): string | null => {
    if (readPackage(dir)?.name !== name) return null
    try {
      return realpathSync(dir)
    } catch {
      return null
    }
  }
  try {
    return found(dirname(req.resolve(`${name}/package.json`)))
  } catch {
    // A package whose `exports` hides `./package.json` cannot be resolved by
    // that path; look in the same directories Node searches, in its order.
    for (const dir of req.resolve.paths(name) ?? []) {
      const hit = found(join(dir, ...name.split('/')))
      if (hit !== null) return hit
    }
    return null
  }
}

/**
 * The project's own `package.json` above `start` declares `packageName` as a
 * dependency or dev dependency. For the hint when the project layer finds no
 * installed copy.
 *
 * @internal
 */
export function projectDeclares(spec: ToolSpec, start: string): boolean {
  const name = spec.packageName
  if (name === undefined) return false
  let dir = resolvePath(start)
  for (;;) {
    const pkg = readPackage(dir)
    if (pkg !== null) {
      return [pkg.dependencies, pkg.devDependencies].some(
        (deps) => typeof deps === 'object' && deps !== null && name in deps,
      )
    }
    const parent = resolvePath(dir, '..')
    if (parent === dir) return false
    dir = parent
  }
}

/**
 * The absolute path of the tool's bin in the installed package at `dir`:
 * `bin` when it is a string, else `bin[spec.name]`. Null when it is missing
 * or points outside the package.
 *
 * @internal
 */
export function projectBin(spec: ToolSpec, dir: string): string | null {
  const bin = readPackage(dir)?.bin
  const rel = typeof bin === 'string' ? bin : bin?.[spec.name]
  if (typeof rel !== 'string' || rel.length === 0) return null
  const abs = resolvePath(dir, rel)
  const inside = relative(dir, abs)
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return null
  }
  return abs
}

/** What runs `file`: `bun` when its `#!` line names bun, else `node`. */
export function binRuntime(file: string): 'bun' | 'node' {
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    const buf = Buffer.alloc(256)
    const n = readSync(fd, buf, 0, buf.length, 0)
    const first = buf.subarray(0, n).toString('utf-8').split('\n', 1)[0] ?? ''
    return /^#!.*\bbun\b/.test(first) ? 'bun' : 'node'
  } catch {
    return 'node'
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

interface PackageFields {
  name?: unknown
  version?: unknown
  bin?: string | Record<string, unknown>
  dependencies?: unknown
  devDependencies?: unknown
}

function readPackage(dir: string): PackageFields | null {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    return typeof pkg === 'object' && pkg !== null ? (pkg as PackageFields) : null
  } catch {
    return null
  }
}

/**
 * True when any of the spec's suppressor variables is present in `env`.
 *
 * @experimental
 */
export function suppressed(spec: ToolSpec, env: Record<string, string | undefined>): boolean {
  return (spec.suppressors ?? []).some((name) => env[name] !== undefined)
}

/**
 * Path equality after `realpath`. Falls back to `resolve` when a path does not
 * exist.
 *
 * @experimental
 */
export function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return resolvePath(a) === resolvePath(b)
  }
}

/**
 * Pick which checkout a launcher should run, and why. The environment
 * variable, the working directory, the saved link, the project's install and
 * the local install are tried in that order.
 * @experimental
 */
export function resolve(spec: ToolSpec, opts: ResolveOptions = {}): Selection {
  const env = opts.env ?? process.env
  const cwd = opts.cwd ?? process.cwd()
  const self = opts.self ?? null
  const isSuppressed = suppressed(spec, env)

  const pick = (source: Selected['source'], checkout: string, reason: string): Selection | null => {
    const abs = resolvePath(checkout)
    if (!isCheckout(spec, abs)) return null
    if (self !== null && samePath(abs, self)) {
      return { source: 'local', checkout: null, entry: null, reason: `${reason}: this checkout` }
    }
    return { source, checkout: abs, entry: join(abs, entryOf(spec)), reason }
  }

  const fromEnv = env[homeVar(spec)]
  if (fromEnv !== undefined && isAbsolute(fromEnv)) {
    const hit = pick('env', fromEnv, `${homeVar(spec)}`)
    if (hit !== null) return hit
  }

  if (cwdLayerActive(spec, env, isSuppressed)) {
    const above = cwdCheckout(spec, cwd)
    if (above !== null) {
      const hit = pick('cwd', above, 'dev checkout above cwd')
      if (hit !== null) return hit
    }
  }

  if (!isSuppressed) {
    const linked = readActive(spec, opts)
    if (linked !== null) {
      const hit = pick('link', linked, 'linked checkout')
      if (hit !== null) return hit
    }
  }

  let hint: string | undefined
  if (projectLayerActive(spec, env, isSuppressed)) {
    const dir = projectInstall(spec, cwd)
    const bin = dir === null ? null : projectBin(spec, dir)
    if (dir !== null && bin !== null) {
      // A workspace symlink can make the project's copy this very checkout.
      const own = [opts.selfInstall ?? null, self].filter((d): d is string => d !== null)
      if (own.some((d) => samePackage(dir, d))) {
        return {
          source: 'local',
          checkout: null,
          entry: null,
          reason: 'project install: this install',
        }
      }
      const version = readPackage(dir)?.version
      return {
        source: 'project',
        checkout: dir,
        entry: bin,
        reason: `project install at ${dir}`,
        runtime: binRuntime(bin),
        version: typeof version === 'string' ? version : null,
      }
    }
    if (dir === null && projectDeclares(spec, cwd)) {
      hint =
        `this project depends on ${spec.packageName} but it is not installed; running the global copy. ` +
        "Run your package manager's install."
    }
  }

  return {
    source: 'local',
    checkout: null,
    entry: null,
    reason: 'local',
    ...(hint ? { hint } : {}),
  }
}

/**
 * Two package roots are the same copy when their real paths are equal. On
 * Windows, `relative` across drives returns an absolute path, which is not
 * `''`, so different drives are different copies.
 */
function samePackage(a: string, b: string): boolean {
  try {
    return relative(realpathSync(a), realpathSync(b)) === ''
  } catch {
    return false
  }
}

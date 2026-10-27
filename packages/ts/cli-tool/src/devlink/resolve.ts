/**
 * Which checkout a launcher should run, and why.
 *
 * Four layers. The first that matches wins:
 *
 *   env    `<NAME>_HOME` names a checkout by absolute path. It is explicit,
 *          so it always applies, even when a suppressor is set. A relative
 *          value is ignored: it would name a different directory, maybe the
 *          repository you stand in, every time you `cd`.
 *   cwd    the cwd is inside a checkout of this tool, so run that source.
 *          Only when the spec sets `cwdLayer`. Off when a suppressor is set
 *          or `<NAME>_CWD_DEV=0`.
 *   link   the `home` file names a checkout. Off when a suppressor is set.
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
 * checks that the two give the same answer.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'

import { readActive, type StateOptions } from './state.ts'
import { cwdLayerActive, entryOf, homeVar, type ToolSpec } from './spec.ts'

/**
 * Which layer picked the checkout: `env`, `cwd`, `link`, or `local` when none
 * did.
 * @experimental
 */
export type Source = 'env' | 'cwd' | 'link' | 'local'

/**
 * A selection that picked a checkout, with the file to run and the reason it
 * won.
 * @experimental
 */
export interface Selected {
  source: 'env' | 'cwd' | 'link'
  /** The checkout root that won. */
  checkout: string
  /** `<checkout>/<entry>`: what to run under Bun. */
  entry: string
  /** Why, for the launcher's stderr line. */
  reason: string
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
 * variable, the working directory, the saved link and the local install are
 * tried in that order.
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

  return { source: 'local', checkout: null, entry: null, reason: 'local' }
}

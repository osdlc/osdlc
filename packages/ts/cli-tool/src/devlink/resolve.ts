/**
 * Which checkout a launcher should run, and why.
 *
 * Four layers, first hit wins:
 *
 *   env    `<NAME>_HOME` names a checkout. Explicit, so it always applies —
 *          even when a suppressor is set.
 *   cwd    the cwd sits inside a checkout of this tool. "I am standing in the
 *          source" means "run this source". Off when a suppressor is set or
 *          `<NAME>_CWD_DEV=0`.
 *   link   the `home` file names a checkout. Off when a suppressor is set.
 *   local  none of the above: the launcher runs what sits beside it — the
 *          canonical install.
 *
 * A layer that names an invalid checkout (no marker) is skipped, not fatal:
 * a deleted checkout must not brick the installed tool. A layer that names
 * the launcher's OWN checkout resolves to `local`, so a link to the very
 * checkout that is installed never re-execs itself.
 *
 * `renderLauncher` writes the same walk in bash for a launcher that has to
 * decide before any JavaScript runtime exists; `tests/launcher.test.ts`
 * holds the two to one answer.
 */

import { realpathSync, statSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'

import { readActive, type StateOptions } from './state.ts'
import { cwdDevVar, entryOf, homeVar, type ToolSpec } from './spec.ts'

/**
 * Which layer picked the checkout: `env`, `cwd`, `link`, or `local` when none did.
 * @experimental
 */
export type Source = 'env' | 'cwd' | 'link' | 'local'

/**
 * A selection that picked a checkout, with the file to run and the reason it won.
 * @experimental
 */
export interface Selected {
  source: 'env' | 'cwd' | 'link'
  /** The checkout root that won. */
  checkout: string
  /** `<checkout>/<entry>` — what to run under Bun. */
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
 * The result of picking a checkout: either a checkout to run or the installed copy.
 * @experimental
 */
export type Selection = Selected | Local

/**
 * Options for picking a checkout: the working directory, the environment and the launcher's own checkout.
 * @experimental
 */
export interface ResolveOptions extends StateOptions {
  /** Defaults to `process.cwd()`. */
  cwd?: string
  /** Defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /**
   * The checkout root the running launcher belongs to, or null for a launcher
   * that is not inside one (an npm install). A layer naming this checkout is
   * the local no-op.
   */
  self?: string | null
}

/**
 * True when `dir` carries the tool's marker as a file (following symlinks),
 * the same test as the launcher's `[ -f ]`.
 *
 * @experimental
 */
export function isCheckout(spec: ToolSpec, dir: string): boolean {
  try {
    return statSync(join(dir, spec.marker)).isFile()
  } catch {
    return false
  }
}

/**
 * The checkout `start` sits inside, walking up to the filesystem root; null when none.
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
 * Realpath-aware equality; falls back to `resolve` when a side is absent.
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
 * Pick which checkout a launcher should run, and why. The environment variable, the
 * working directory, the saved link and the local install are tried in that order.
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
  if (fromEnv !== undefined && fromEnv.length > 0) {
    const hit = pick('env', fromEnv, `${homeVar(spec)}`)
    if (hit !== null) return hit
  }

  if (!isSuppressed && env[cwdDevVar(spec)] !== '0') {
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

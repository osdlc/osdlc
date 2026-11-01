/**
 * Whether a checkout's dependencies are installed, checked before a hand-off
 * to its source. A checkout cloned but never installed would otherwise fail
 * later, inside its own code, with an import error that does not say why.
 * The bash launcher's `need_deps` does the same check.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * The first dependency of `entry` that `checkout` has not installed, or null
 * when all are. It is a name from the `dependencies` of a `package.json`
 * between the entry's directory and the checkout, with no
 * `node_modules/<name>` at or above that `package.json`, up to the
 * filesystem root as bun looks, since a workspace member's dependencies can
 * be hoisted above the checkout; or `'node_modules'` when one is missing and
 * the checkout has no `node_modules` at all. A checkout with no dependencies needs no
 * `node_modules`, and bun creates none for it.
 * @experimental
 */
export function missingDependency(checkout: string, entry: string): string | null {
  const root = resolve(checkout)
  for (let pkg = dirname(resolve(entry)); ; pkg = dirname(pkg)) {
    for (const dep of dependencies(join(pkg, 'package.json'))) {
      if (installedAbove(dep, pkg)) continue
      return existsSync(join(root, 'node_modules')) ? dep : 'node_modules'
    }
    if (pkg === root || dirname(pkg) === pkg) return null
  }
}

/** The line that refuses a hand-off to `checkout`, for what {@link missingDependency} found. */
export function missingDependencyLine(name: string, checkout: string, missing: string): string {
  return missing === 'node_modules'
    ? `${name}: ${checkout} has no node_modules. Run 'bun install' there.`
    : `${name}: ${checkout} is missing package '${missing}'. Run 'bun install' there.`
}

/** The `dependencies` names in the package.json at `file`; none when it is missing or bad. */
function dependencies(file: string): string[] {
  try {
    const deps = (JSON.parse(readFileSync(file, 'utf-8')) as { dependencies?: unknown })
      .dependencies
    return typeof deps === 'object' && deps !== null ? Object.keys(deps) : []
  } catch {
    return []
  }
}

/** Whether `node_modules/<dep>` exists at `from` or any directory above it. */
function installedAbove(dep: string, from: string): boolean {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', dep))) return true
    if (dirname(dir) === dir) return false
  }
}

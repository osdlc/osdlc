/**
 * Whether a checkout's entry can run under the spec's runtime, checked when
 * `dev link` or `dev use` selects the checkout, so a link that cannot start
 * is refused then, not on every later run.
 *
 * A `runtime: 'node'` checkout runs its source entry as it is. A TypeScript
 * entry relies on Node's own type stripping, which is on by default from
 * Node 22.18 (and 23.6) and refused for a file under `node_modules`. The
 * launch does not repeat the version check: under Bun it would cost a
 * `node --version` on every run.
 */

import { realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'

import { defaultNode } from './exec.ts'
import { entryOf, runtimeOf, type ToolSpec } from './spec.ts'

/**
 * Options for {@link entryProblem}: the environment whose `PATH` finds
 * `node`, and the `node` itself.
 * @internal
 */
export interface EntryCheckOptions {
  /** Defaults to `process.env`. */
  env?: Record<string, string | undefined> | undefined
  /** The `node` the checkout will run under. Defaults to {@link defaultNode}. */
  node?: string | undefined
}

/** The first Node release of each line that strips types without a flag. */
const TYPE_STRIPPING: Record<number, number> = { 22: 18, 23: 6 }

/**
 * Whether node runs `entry` as TypeScript: `.ts`, `.mts` or `.cts`.
 * @internal
 */
export function isTypeScriptEntry(entry: string): boolean {
  return /\.[cm]?ts$/.test(entry)
}

/**
 * Whether the Node of `version` (`v22.18.0` or `22.18.0`) strips types by
 * default: 22.18 or later in the 22 line, 23.6 or later in the 23 line, and
 * every release from 24 on. False for a version it cannot read.
 * @internal
 */
export function stripsTypes(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)\.\d+/.exec(version.trim())
  if (m === null) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  if (major >= 24) return true
  const first = TYPE_STRIPPING[major]
  return first !== undefined && minor >= first
}

/**
 * Why `checkout`'s entry cannot run under the spec's runtime, as a clause
 * that follows `cannot run <checkout>: `, or null when it can. The entry must
 * be a file. Under node, a TypeScript entry must not sit under
 * `node_modules`, and the `node` that will run it must strip types.
 * @internal
 */
export function entryProblem(
  spec: ToolSpec,
  checkout: string,
  opts: EntryCheckOptions = {},
): string | null {
  const rel = entryOf(spec)
  const entry = join(checkout, rel)
  try {
    if (!statSync(entry).isFile()) return `its entry ${rel} is not a file`
  } catch {
    return `it has no entry ${rel}`
  }
  if (runtimeOf(spec) !== 'node' || !isTypeScriptEntry(rel)) return null
  // Node refuses to strip types from a file whose path has a node_modules folder.
  const real = realpathSync(entry)
  if (real.split(sep).includes('node_modules')) {
    return `node does not strip types from a file under node_modules (${real})`
  }
  const node = opts.node ?? defaultNode(opts.env ?? process.env)
  const need = `${rel} is TypeScript, which node runs only from 22.18 on`
  if (node === undefined) {
    return `${need}, and no node is on an absolute PATH entry. Install Node 22.18 or later.`
  }
  const version = nodeVersion(node, checkout)
  if (version === null) {
    return `${need}, and ${node} --version did not answer. Check that it runs.`
  }
  if (!stripsTypes(version)) {
    // 23.5 is newer than 22.18 and still does not strip types, so name 23.6.
    const line = /^v?23\./.test(version) ? ' (in the 23 line, from 23.6)' : ''
    return `${need}${line}; ${node} is ${version}. Install Node 22.18 or later, or point the spec's entry at a built .js file.`
  }
  return null
}

/**
 * The version `node --version` prints, or null when it does not run. The
 * running Node answers from `process.versions` without a spawn.
 */
function nodeVersion(node: string, cwd: string): string | null {
  if (node === process.execPath && process.versions['bun'] === undefined) {
    return process.versions.node
  }
  const r = spawnRunner(node).run(['--version'], { cwd, timeoutMs: 10_000 })
  const out = r.stdout.trim()
  return r.exitCode === 0 && out.length > 0 ? out : null
}

import type { z } from 'zod'

import { isWithin } from '../paths.ts'
import type { DiffReport, packageDependencySchema, packageMapSchema } from '../report/schema.ts'

/** Whether a path is a manifest, at any depth, given the manifest file names (`MANIFEST_FILES` in `@osdlc/system-model/build`). */
export function manifestTest(names: readonly string[]): (path: string) => boolean {
  const files = new Set(names)
  return (path) => files.has(path.slice(path.lastIndexOf('/') + 1))
}

/** A directory holding a package manifest, as a manifest walk finds it. */
export interface PackageManifest {
  /** Relative to the repository root; `''` is the root. */
  dir: string
  name: string | null
}

/**
 * One package depending on another: `from` and `to` are package directories.
 */
export type PackageDependency = z.infer<typeof packageDependencySchema>
/**
 * The packages a change touches, those that depend on them, and the dependencies among them, with
 * the counts of what a size cap left out.
 */
export type PackageMap = z.infer<typeof packageMapSchema>
/**
 * One package in a {@link PackageMap}: its directory, label and status, and the files and lines of
 * the change inside it.
 */
export type PackageNode = PackageMap['nodes'][number]

/**
 * Options for {@link buildPackageMap} and {@link describeChange}.
 */
export interface PackageMapOptions {
  /** Most nodes shown, changed packages first by lines changed. Default 24. */
  maxNodes?: number
}

const ROOT_LABEL = '(repository root)'

/** The deepest package directory holding `path`, or `''` when none does. */
function packageOf(path: string, dirs: readonly string[]): string {
  let best = ''
  for (const dir of dirs) {
    if (dir !== '' && isWithin(path, dir) && dir.length > best.length) {
      best = dir
    }
  }
  return best
}

/**
 * The packages a change touches, with its lines per package, plus the
 * packages that depend on them directly, and the dependencies among all of
 * those. Files under no manifest belong to the repository root. A file
 * renamed across packages counts in both: its added lines where it went,
 * its removed lines where it was.
 *
 * @experimental
 */
export function buildPackageMap(
  report: DiffReport,
  manifests: readonly PackageManifest[],
  dependencies: readonly PackageDependency[],
  options: PackageMapOptions = {},
): PackageMap {
  const dirs = [...new Set(manifests.map((m) => m.dir))]
  const names = new Map<string, string[]>()
  for (const m of manifests) {
    if (m.name !== null) names.set(m.dir, [...new Set([...(names.get(m.dir) ?? []), m.name])])
  }
  const newNode = (dir: string, status: PackageNode['status']): PackageNode => ({
    dir,
    label: names.get(dir)?.join(', ') ?? (dir === '' ? ROOT_LABEL : dir),
    status,
    files: 0,
    added: 0,
    removed: 0,
    logic: 0,
  })

  const changed = new Map<string, PackageNode>()
  const nodeAt = (dir: string): PackageNode => {
    const node = changed.get(dir) ?? newNode(dir, 'changed')
    changed.set(dir, node)
    return node
  }
  for (const f of report.fileList) {
    const node = nodeAt(packageOf(f.path, dirs))
    node.files += 1
    node.added += f.added
    const logic = f.kindOperations?.logic
    if (logic !== undefined) node.logic += logic.added + logic.changed + logic.moved
    // A file renamed out of a package takes its removed lines from there.
    const from = f.oldPath === null ? node : nodeAt(packageOf(f.oldPath, dirs))
    if (from !== node) from.files += 1
    from.removed += f.removed
  }

  const maxNodes = options.maxNodes ?? 24
  const byLines = [...changed.values()].sort(
    (a, b) => b.added + b.removed - (a.added + a.removed) || a.dir.localeCompare(b.dir),
  )
  const shown = byLines.slice(0, maxNodes)
  const shownDirs = new Set(shown.map((n) => n.dir))
  // The root manifest of a workspace depends on most of its packages, so it is not drawn as a dependent.
  const dependents = [
    ...new Set(
      dependencies
        .filter((d) => shownDirs.has(d.to) && !changed.has(d.from) && d.from !== '')
        .map((d) => d.from),
    ),
  ].sort()
  const affected = dependents.slice(0, Math.max(0, maxNodes - shown.length))
  const nodes = [...shown, ...affected.map((dir) => newNode(dir, 'affected'))]
  const inMap = new Set(nodes.map((n) => n.dir))
  const seen = new Set<string>()
  const edges = dependencies.filter((d) => {
    const key = `${d.from}\0${d.to}`
    if (d.from === d.to || !inMap.has(d.from) || !inMap.has(d.to) || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    nodes,
    edges,
    omitted: byLines.length - shown.length,
    omittedDependents: dependents.length - affected.length,
  }
}

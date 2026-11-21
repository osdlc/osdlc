/** The pure half: manifests in, dependency graph out. No I/O. */

import {
  byteCompare,
  type DependencyGraph,
  type GraphEdge,
  type GraphNode,
  type ManifestInfo,
} from './manifest-model.ts'

/** What `buildDependencyGraph` accepts. */
export interface GraphOptions {
  /**
   * Materialize dependencies that name nothing in the manifest set as nodes
   * flagged `external: true`. Default: such dependencies are dropped.
   */
  includeExternal?: boolean
}

/**
 * Build a dependency graph from a set of walked manifests. Pure — no I/O.
 *
 * One node per manifest; edges connect a declaring manifest to the in-set
 * manifest whose `name` matches the dependency, within the same ecosystem
 * (a cargo dep never resolves to an npm package of the same name).
 *
 * Output is deterministic: in-set nodes keep the walk's order, external nodes
 * are appended sorted by id, and edges are sorted. Callers render this, diff
 * it, and gate on it — an unstable order would show up as phantom churn.
 */
export function buildDependencyGraph(
  manifests: ManifestInfo[],
  options: GraphOptions = {},
): DependencyGraph {
  const warnings: string[] = []
  const nodes: GraphNode[] = []
  const usedIds = new Set<string>()
  /** `${ecosystem}:${name}` → node id, for edge resolution. */
  const byName = new Map<string, string>()

  const claimId = (preferred: string, fallbacks: string[]): string => {
    for (const candidate of [preferred, ...fallbacks]) {
      if (candidate !== '' && !usedIds.has(candidate)) {
        usedIds.add(candidate)
        return candidate
      }
    }
    let n = 2
    while (usedIds.has(`${preferred}#${n}`)) n++
    const id = `${preferred}#${n}`
    usedIds.add(id)
    return id
  }

  for (const m of manifests) {
    const dirId = m.dir === '' ? '.' : m.dir
    const preferred = m.name ?? dirId
    const id = claimId(preferred, [dirId, `${preferred}#${m.ecosystem}`])
    if (id !== preferred) {
      warnings.push(`id collision: "${preferred}" (${m.dir || '.'}) already taken — using "${id}"`)
    }
    nodes.push({
      id,
      name: m.name,
      dir: m.dir,
      ecosystem: m.ecosystem,
      external: false,
      kind: m.ecosystem === 'node' ? 'package' : 'crate',
      parent: null,
      manifest: m,
    })
    if (m.name !== null) {
      const key = `${m.ecosystem}:${m.name}`
      if (byName.has(key)) {
        warnings.push(
          `duplicate ${m.ecosystem} manifest name "${m.name}" (${m.dir || '.'}) — edges resolve to the first`,
        )
      } else {
        byName.set(key, id)
      }
    }
  }

  const edges: GraphEdge[] = []
  /** `${ecosystem}:${name}` → node id, for external nodes already created. */
  const externals = new Map<string, string>()
  const externalNodes: GraphNode[] = []

  for (const node of nodes) {
    const m = node.manifest
    if (!m) continue
    for (const dep of m.deps) {
      const key = `${m.ecosystem}:${dep.name}`
      let to = byName.get(key)
      if (to === undefined) {
        if (!options.includeExternal) continue
        to = externals.get(key)
        if (to === undefined) {
          to = claimId(dep.name, [`${dep.name}#external`])
          externals.set(key, to)
          externalNodes.push({
            id: to,
            name: dep.name,
            dir: null,
            ecosystem: m.ecosystem,
            external: true,
            kind: 'external',
            parent: null,
          })
        }
      }
      edges.push({
        from: node.id,
        to,
        kind: dep.kind,
        specifierKind: dep.specifierKind,
        specifier: dep.specifier,
      })
    }
  }

  externalNodes.sort((a, b) => byteCompare(a.id, b.id))
  nodes.push(...externalNodes)

  edges.sort(
    (a, b) =>
      byteCompare(a.from, b.from) ||
      byteCompare(a.to, b.to) ||
      byteCompare(a.kind, b.kind) ||
      byteCompare(a.specifier, b.specifier),
  )

  return { nodes, edges, warnings }
}

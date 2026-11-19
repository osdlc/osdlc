/**
 * The `SystemGraph` wire payload: a walk of one project, flattened into the
 * shape the system-graph viewer reads.
 *
 * Peer of the Rust `system_graph` module, which arrives in a later change.
 * The shape itself is `@osdlc/system-model`'s; what lives here is the walk
 * that fills it in.
 *
 * Field names are snake_case and the key order matches the Rust structs'
 * declaration order, so `JSON.stringify` of this and `serde_json` of that are
 * byte-identical — which is what makes the two walkers diffable rather than
 * merely similar. The literal below is the one place that order is asserted,
 * so keep it in the schema's order rather than sorting it.
 */

import { basename, resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import { scanAspects } from './aspect-scan.ts'
import { applyContainment } from './containment.ts'
import { buildDependencyGraph } from './dependency-graph.ts'
import type { Ecosystem, SystemGraph } from './graph.ts'
import { walkManifests, type WalkOptions } from './manifest-walk.ts'

// Re-exported so a caller that only wants the payload's shape need not
// also depend on the contract package by name.
export type { SystemEdge, SystemGraph, SystemNode } from './graph.ts'

/** What `buildSystemGraph` accepts. */
export interface SystemGraphOptions {
  /** Also materialise the registry packages the project depends on. */
  includeExternal?: boolean
  /** Passed through to `walkManifests`. */
  walk?: WalkOptions
}

/** Beside `externalGroupLabel`: the ecosystem's own word for the thing. */
const WORKSPACE_LABEL: Record<Ecosystem, string> = {
  node: 'Node workspace',
  rust: 'Rust workspace',
}

/**
 * What to call a node on screen.
 *
 * Its manifest's own name (an empty one counts as none), else its directory —
 * which is what an operator would call it. The case neither covers is a
 * manifest with NO name whose directory is the repo itself: a virtual
 * workspace, `[workspace]` with no `[package]` section. Falling through to the
 * id would draw a card labelled `.`, which tells the reader nothing about a
 * node that does carry real workspace-wide dependencies other crates inherit.
 *
 * Named for what it IS instead, and kept on the map rather than folded away,
 * because those inherited declarations are genuinely made here — moving them
 * to the repo root would say they were written somewhere they were not.
 */
function nodeLabel(n: {
  name: string | null
  dir: string | null
  id: string
  ecosystem: Ecosystem | null
}): string {
  if (n.name !== null && n.name !== '') return n.name
  if (n.dir !== null && n.dir !== '') return n.dir
  if (n.ecosystem !== null) return WORKSPACE_LABEL[n.ecosystem]
  return n.id
}

/**
 * Walk `root` and return its structure.
 *
 * Stateless and uncached on purpose. The walk of a monorepo this size takes a
 * fraction of a second, and a cache would mean a view that quietly disagrees
 * with the disk after an install or a new package — exactly the moment an
 * operator opens it.
 */
export async function buildSystemGraph(
  root: string,
  options: SystemGraphOptions = {},
): Promise<SystemGraph> {
  const includeExternal = options.includeExternal ?? false
  const absolute = resolve(root)
  const info = await stat(absolute).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null
    throw new Error(`cannot read ${absolute}: ${e.message}`, { cause: e })
  })
  if (info === null || !info.isDirectory()) {
    throw new Error(`not a directory: ${absolute}`)
  }
  const rootLabel = basename(absolute) || absolute

  const manifests = await walkManifests(absolute, options.walk ?? {})
  const graph = buildDependencyGraph(manifests, { includeExternal })
  applyContainment(graph, { rootLabel, groupExternals: true })

  return {
    root: absolute,
    root_label: rootLabel,
    include_external: includeExternal,
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      label: nodeLabel(n),
      dir: n.dir,
      parent: n.parent,
      kind: n.kind,
      ecosystem: n.ecosystem,
      external: n.external,
      description: n.manifest?.description ?? null,
      private: n.manifest?.private ?? false,
      is_nuxt_layer: n.manifest?.isNuxtLayer ?? false,
      has_bin: n.manifest?.hasBin ?? false,
      error: n.manifest?.error ?? null,
      // Synthetic nodes and externals have no manifest to scan, so they make
      // no claim rather than an empty-looking one.
      aspects: n.manifest ? scanAspects(n.manifest) : [],
    })),
    edges: graph.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      specifier_kind: e.specifierKind,
      specifier: e.specifier,
    })),
    warnings: graph.warnings,
    manifests_scanned: manifests.length,
  }
}

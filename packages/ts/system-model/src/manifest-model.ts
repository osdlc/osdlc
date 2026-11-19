import type { DepKind, Ecosystem, NodeKind, SpecifierKind } from './graph.ts'

export type { DepKind, Ecosystem, NodeKind, SpecifierKind }

/**
 * The manifest data model. Plain interfaces on purpose: any provider
 * producing the same shapes can stand in for the walker.
 *
 * Field-for-field with the Rust peer's model, in camelCase.
 */

/** One declared dependency, as written in the manifest. */
export interface DepDecl {
  /**
   * The depended-on package's real name. For a cargo dependency renamed via
   * `package = "…"`, this is the real crate name, not the alias.
   */
  name: string
  kind: DepKind
  /** The raw specifier text (`workspace:*`, `^1.2.3`, a path, …). */
  specifier: string
  specifierKind: SpecifierKind
}

/** One manifest found by the walk. */
export interface ManifestInfo {
  /** Absolute path to the manifest file. */
  path: string
  /** Directory holding the manifest, relative to the walk root (`''` = the root itself). */
  dir: string
  ecosystem: Ecosystem
  /** `package.json` `name`, or cargo `[package].name`. Null when absent (e.g. a virtual cargo workspace root). */
  name: string | null
  /** Declared version, when it is a plain string. */
  version: string | null
  /** Node `"private": true`, or cargo `publish = false`. */
  private: boolean
  description: string | null
  /** Workspace declarations: node `workspaces` globs, or cargo `[workspace].members`. */
  workspaces: string[]
  /**
   * The entry points a package declares, kept verbatim.
   *
   * Read rather than discarded because an entry point's EXTENSION is the
   * package's own statement about what it ships — `src/index.ts` says
   * TypeScript more directly than any dependency does.
   * Both null for cargo, which has no equivalent field.
   */
  entry: { main: string | null; types: string | null }
  /** Derived hint: node `main` points at `nuxt.config.ts`, the Nuxt-layer convention. */
  isNuxtLayer: boolean
  /** Derived hint: node `bin` entries, or cargo `[[bin]]` sections. */
  hasBin: boolean
  deps: DepDecl[]
  /**
   * Set when the manifest could not be parsed. The entry still appears in the
   * walk result (with empty/default fields) so a malformed file never aborts
   * the walk — it just carries its error.
   *
   * Explicitly `null` rather than absent, so a serialized `ManifestInfo` has
   * the same key set as the Rust peer's `Option<String>`.
   */
  error: string | null
}

/** One node of the graph. */
export interface GraphNode {
  /**
   * Stable id: the manifest name when it has one, else its root-relative dir
   * (`'.'` for the walk root). De-collided with a suffix if two manifests
   * would otherwise share an id — see the graph `warnings`.
   */
  id: string
  name: string | null
  /**
   * Root-relative dir for in-set manifests and synthetic groups; null for
   * external nodes.
   */
  dir: string | null
  /**
   * For in-set nodes, the manifest's ecosystem. For external nodes, the
   * ecosystem of the (first) manifest that declared the dependency. For a
   * synthetic group, null — a directory belongs to no ecosystem.
   */
  ecosystem: Ecosystem | null
  /** True for a dependency named by some manifest but not present in the walked set. */
  external: boolean
  kind: NodeKind
  /**
   * The containing node's id. Null for containment roots: the repo node, and
   * any external node not placed under an external group.
   */
  parent: string | null
  /** The full manifest, for in-set nodes. */
  manifest?: ManifestInfo
}

/**
 * One edge: a manifest declaring a dependency on another node.
 *
 * Containment is deliberately NOT an edge — it is the `parent` field on
 * `GraphNode`. A renderer that groups by containment needs a tree, and a tree
 * expressed as edges has to be re-derived by every consumer.
 */
export interface GraphEdge {
  /** `GraphNode.id` of the declaring manifest. */
  from: string
  /** `GraphNode.id` of the dependency target. */
  to: string
  kind: DepKind
  specifierKind: SpecifierKind
  /** The raw specifier text, carried through from the `DepDecl`. */
  specifier: string
}

/** The result of `buildDependencyGraph`. */
export interface DependencyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Non-fatal oddities: duplicate names, id collisions. */
  warnings: string[]
}

/**
 * Byte-wise string comparison, the ordering Rust's `String::cmp` gives.
 *
 * JavaScript's default sort compares UTF-16 code units, which disagrees with
 * UTF-8 byte order above the BMP — and every ordering here is part of the
 * payload the peer implementations are diffed on, so it has to match.
 */
export function byteCompare(a: string, b: string): number {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.compare(y)
}

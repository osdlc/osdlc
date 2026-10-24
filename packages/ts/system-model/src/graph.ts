import type { Aspect } from './aspect.ts'

/**
 * The system model: a project's structure in its wire format.
 *
 * Field names are snake_case because that is the wire format. ontogen passes
 * these read-model DTOs through unchanged from
 * `solutions/ontological/desktop/src-tauri/src/schema/system_graph.rs`, which
 * is the authority on the shape. This file states that shape once for
 * TypeScript, so a producer, a consumer and a host all use the same types.
 *
 * The whole payload is sent in one response. Containment is a tree the viewer
 * folds and unfolds often, and a round trip per fold would be too slow. So the
 * full node set and the full edge set are sent together, and the client does
 * its own aggregation.
 */

/**
 * What a node is structurally. Containment is drawn by this kind.
 *
 * `group` is synthetic: a directory that holds manifests but has none of its
 * own. `repo` is the single containment root. `external` is outside the tree,
 * because a registry dependency is not inside the repo.
 */
export type NodeKind = 'repo' | 'group' | 'package' | 'crate' | 'external'

/** How a dependency is declared. */
export type DepKind = 'prod' | 'dev' | 'peer' | 'optional' | 'build'

/** What the dependency's specifier points at. */
export type SpecifierKind = 'workspace' | 'file' | 'path' | 'registry' | 'other'

/** Which packaging ecosystem a manifest belongs to. */
export type Ecosystem = 'node' | 'rust'

/**
 * One package, crate, directory, or external dependency.
 *
 * The enum-shaped fields are typed `string`, not as the unions above. The
 * unions are exported separately for code that wants to narrow. This is
 * deliberate and matches the Rust. A newer walker may add a new node kind or
 * dependency kind. A consumer that matched an exhaustive union would break on
 * data it could have shown.
 */
export interface SystemNode {
  /**
   * Stable within one payload: the manifest's name, else its root-relative
   * directory. Synthetic nodes use a `:`-bearing id (`repo:root`,
   * `external:node`) that no real package name can collide with.
   */
  id: string
  /** The display name. Never empty: a manifest with no name uses its dir. */
  label: string
  /**
   * Root-relative directory, `''` for the repo itself. `null` for nodes that
   * are not on disk here (externals and their groups).
   */
  dir: string | null
  /**
   * The containing node's id. `null` marks a containment root: the repo, and
   * each external group.
   */
  parent: string | null
  /** A {@link NodeKind}, widened. See the note on this interface. */
  kind: string
  /** An {@link Ecosystem}, widened, or `null` for a directory. */
  ecosystem: string | null
  /** Named by some manifest but not present in the walked tree. */
  external: boolean
  /** The manifest's own `description`, when it declares one. */
  description: string | null
  /** npm `"private": true`, or cargo `publish = false`. */
  private: boolean
  /** Derived hint: npm `main` points at `nuxt.config.ts`, so it is a Nuxt layer. */
  is_nuxt_layer: boolean
  /** Derived hint: npm `bin` entries, or cargo `[[bin]]` sections. */
  has_bin: boolean
  /**
   * Set when this node's manifest could not be parsed. The node still appears,
   * because a broken manifest the operator cannot see is worse than one marked.
   */
  error: string | null
  /**
   * The technologies this node uses, and the evidence for each.
   *
   * A list, because a package is rarely one technology. See `./aspect`.
   * Empty for synthetic nodes (the repo root, directory groups) and for
   * externals, which are named by a manifest rather than read from one.
   */
  aspects: Aspect[]
}

/**
 * One declared dependency, from the declaring node to the depended-on node.
 *
 * Containment is deliberately not here. It is {@link SystemNode.parent}. The
 * two relations have different shapes (a mesh and a tree), and a viewer draws
 * them differently.
 */
export interface SystemEdge {
  from: string
  to: string
  /** A {@link DepKind}, widened. */
  kind: string
  /** A {@link SpecifierKind}, widened. */
  specifier_kind: string
  /** The raw specifier text (`workspace:*`, `^1.2.3`, a path, …). */
  specifier: string
}

/** A project's structure, in one payload. */
export interface SystemGraph {
  /**
   * Absolute path of the project this graph was walked from. Shown so the view
   * always states its scope correctly.
   */
  root: string
  /** The checkout's directory name, and the repo node's label. */
  root_label: string
  /** True when external (registry) dependencies were included. */
  include_external: boolean
  nodes: SystemNode[]
  edges: SystemEdge[]
  /**
   * Non-fatal problems from the walk, such as duplicate manifest names or id
   * collisions. They are data, not errors, so one duplicate does not empty the
   * view.
   */
  warnings: string[]
  /** Manifests walked, including ones that failed to parse. */
  manifests_scanned: number
}

/** The known {@link DepKind}s, in the order a control should offer them. */
export const ALL_DEP_KINDS: readonly DepKind[] = ['prod', 'dev', 'peer', 'optional', 'build']

/** The known {@link NodeKind}s. */
export const ALL_NODE_KINDS: readonly NodeKind[] = ['repo', 'group', 'package', 'crate', 'external']

/** The known {@link SpecifierKind}s. */
export const ALL_SPECIFIER_KINDS: readonly SpecifierKind[] = [
  'workspace',
  'file',
  'path',
  'registry',
  'other',
]

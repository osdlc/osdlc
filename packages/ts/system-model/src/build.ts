/**
 * `@osdlc/system-model/build`: walk a directory for package manifests and
 * build the dependency graph they declare.
 *
 * Node only: it reads the filesystem. The browser-safe wire types are in
 * `@osdlc/system-model/graph`.
 */

export { walkManifests, DEFAULT_EXCLUDES, type WalkOptions } from './manifest-walk.ts'
export { buildDependencyGraph, type GraphOptions } from './dependency-graph.ts'
export type {
  DepDecl,
  DependencyGraph,
  GraphEdge,
  GraphNode,
  ManifestInfo,
} from './manifest-model.ts'

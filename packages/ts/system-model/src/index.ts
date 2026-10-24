/**
 * `@osdlc/system-model`: the wire contract, as one browser-safe entry.
 *
 * Everything here is types and small pure helpers from `./graph`,
 * `./aspect`, `./client` and `./saved-view`, with no Node built-in and no
 * dependency. Detection, tools and runners are in `@osdlc/system-model/detect`.
 */

export {
  ALL_DEP_KINDS,
  ALL_NODE_KINDS,
  ALL_SPECIFIER_KINDS,
  type DepKind,
  type Ecosystem,
  type NodeKind,
  type SpecifierKind,
  type SystemEdge,
  type SystemGraph,
  type SystemNode,
} from './graph.ts'
export {
  ALL_ASPECTS,
  EVIDENCE_TIERS,
  hasAspect,
  strongestTier,
  type Aspect,
  type AspectId,
  type Evidence,
  type EvidenceKind,
} from './aspect.ts'
export type { SystemGraphClient } from './client.ts'
export type { ProjectFacets, ProjectFacetsStore } from './project-facets.ts'
export {
  SLUG_PATTERN,
  slugify,
  type PositionOverride,
  type SavedView,
  type SavedViewStore,
} from './saved-view.ts'

/**
 * `@osdlc/system-model`: what a repository contains, and what you can run in it.
 *
 * Two halves share this root entry. The wire contract (`./graph`,
 * `./aspect`, `./client`, `./saved-view`) is types and small pure helpers.
 * Detection, tools and runners start at `createProject`: the core knows no
 * tool, so register tools from `@osdlc/system-model/builtins` or your own
 * `ToolDef`s, and ask questions of the result.
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

export { createProject } from './project.ts'
export type { Project, ProjectOptions, Runners } from './project.ts'

export { diagnostics, evidence, tasks } from './model.ts'
export type {
  Catalog,
  ChainSegment,
  Diagnostic,
  DiscoveryMode,
  Param,
  ProviderResult,
  RunnerBrand,
  RunnerReport,
  Severity,
  Task,
  TaskExecutionTarget,
  TaskOrigin,
} from './model.ts'

export type {
  CollectOptions,
  DetectOptions,
  ProviderContext,
  ProviderKind,
  RunnerContext,
} from './contract.ts'

export type {
  Detected,
  EcosystemDef,
  HookDef,
  HookManagerRole,
  LanguageRule,
  MalformedManifest,
  ManifestDef,
  Marker,
  Package,
  PackageManagerRole,
  ProjectProfile,
  RoleName,
  RunnerRole,
  ToolDef,
  ToolFact,
  ToolManagerRole,
} from './tool.ts'

export type {
  CargoFact,
  DepFact,
  DepFactKind,
  DepFactSpecifierKind,
  GemfileFact,
  GoModFact,
  ManifestFacts,
  PackageJsonFact,
  PyprojectFact,
} from './manifests.ts'

export type { PackageManagerChoice, ToolAction } from './roles.ts'
export type { PinnedInstall, PinnedInstallOptions, PinnedSource } from './pinned.ts'
export type { CachedCatalog, RunnerCacheState, StaleReason } from './cached.ts'

export { DEFAULT_EXCLUDES } from './discovery.ts'
export { SYNTHESIZED_RUNNERS } from './synthesized.ts'

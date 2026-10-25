/**
 * `@osdlc/system-model/detect`: what a repository contains, and what you can
 * run in it.
 *
 * The core knows no tool. Register tools with `createProject`, from
 * `@osdlc/system-model/builtins` or your own `ToolDef`s, and ask questions of
 * the result. The evidence types are the wire contract's, from the root entry.
 */

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

export { DEFAULT_EXCLUDES, MAX_WALK_DEPTH, MAX_WALK_FILES } from './discovery.ts'
export { MAX_READ_BYTES } from './read.ts'
export { SYNTHESIZED_RUNNERS } from './synthesized.ts'

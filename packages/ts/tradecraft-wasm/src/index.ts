/**
 * Barrel: re-exports only, no logic of its own. The programmatic surface of
 * `@osdlc/tradecraft-wasm` — the core plus the Node vfs adapter. No CLI entry
 * point; the CLI is the separate `skillwright` Rust binary.
 */

export {
  adoptSkills,
  canonicalTarget,
  CoreError,
  discoverComponents,
  exportSkills,
  InvalidNamespaceError,
  knownTargets,
  publishableKinds,
  publishSkill,
  statusOf,
  validateNamespace,
} from './core.ts'
export type {
  AdoptedSkill,
  AdoptMode,
  AdoptReport,
  AdoptRequest,
  AdoptStatus,
  CoreErrorName,
  DiscoveredComponent,
  DiscoverRequest,
  DiscoveryReport,
  EntityKind,
  KindSource,
  ExportMode,
  ExportReport,
  ExportRequest,
  ExportUnit,
  ContainerIdentity,
  MarketplaceConfig,
  PluginOverrides,
  PublishMode,
  PublishRequest,
  PublishReason,
  PublishReport,
  PublishedFile,
  PublishOutcome,
  PublishState,
  PublishStatus,
  PublishUnitStatus,
  ReasonToken,
  SkippedNote,
  StatusRequest,
  Target,
  UnitStatus,
} from './core.ts'

export { toCorePath, toHostPath } from './host-path.ts'
export { createNodeVfs } from './node-vfs.ts'
export type { BaseVfs, LinkMethods, NodeFs, NodeVfsOptions, Vfs } from './node-vfs.ts'

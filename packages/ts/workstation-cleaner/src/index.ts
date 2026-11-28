/**
 * `@osdlc/workstation-cleaner`: machine cleanup as plugins. A plugin proposes
 * candidates and objects to others'; the core runs the phases in the order
 * the plugins are given, with one flat plan and one receipt. The `git` plugin
 * is repo-cleaner. Everything `./plugin.ts` exports is exported here too.
 */

export { VERSION } from './version.generated.ts'
export * from './plugin.ts'
export { DROP_REASONS, type DropReason } from './types.ts'
export {
  BUILT_IN_PLUGINS,
  findPlugins,
  loadPlugins,
  type Loaded,
  type Packages,
} from './registry.ts'
export {
  PackageError,
  PackageLoadError,
  loadPackages,
  packageEntries,
  packageRoots,
  type LoadedPackage,
  type PackageEntry,
  type PackageFailure,
} from './load.ts'
export {
  PLAN_VERSION,
  PlanSchema,
  RECEIPT_VERSION,
  ReceiptSchema,
  parsePlan,
  readPlan,
  writePlan,
  writeReceipt,
  type Dropped,
  type Plan,
  type Receipt,
  type Step,
} from './plan.ts'
export {
  DEFAULT_SELECTION,
  DELETE_LIMIT_MS,
  DISCARD_USER_DATA,
  HOOK_LIMIT_MS,
  HookTimeout,
  OUTSIDE_ROOTS,
  SelectionError,
  StalePlan,
  UNMEASURED,
  checkSelection,
  clean,
  decide,
  decidePlan,
  inspect,
  plan,
  recheck,
  spares,
  survey,
  type CleanOptions,
  type Decision,
  type Inspection,
  type PluginState,
  type Selection,
  type Survey,
} from './run.ts'
export { PERSONAL_FOLDERS } from './roots.ts'
export { gitDefinitionWith, gitPlugin, type GitPluginOptions } from './git.ts'
export { cargoPlugin, CARGO_PLUGIN } from './cargo.ts'
export { nodePlugin, NODE_PLUGIN } from './node.ts'
export {
  DOCKER_BUILD_CACHE,
  DOCKER_IMAGE,
  DOCKER_PLUGIN,
  DOCKER_VOLUME,
  dockerPlugin,
  type DockerOptions,
} from './docker.ts'
export { AGENT_HISTORY_PLUGIN, agentHistoryDefinition } from './agent-history.ts'
export { jetbrainsPlugin, JETBRAINS_PLUGIN, type JetbrainsOptions } from './jetbrains.ts'
export {
  toolchainsDefinition,
  toolchainsPlugin,
  TOOLCHAINS_PLUGIN,
  type ToolchainsOptions,
} from './toolchains.ts'
export { type ArtifactOptions } from './artifacts.ts'
export {
  DEFAULT_MAX_ENTRIES,
  DESCRIPTOR_SCHEMA_URL,
  DESCRIPTOR_VERSION,
  DescriptorCandidateSchema,
  DescriptorError,
  DescriptorSchema,
  OSES,
  ProjectEntrySchema,
  descriptorIssues,
  descriptorJsonSchema,
  parseDescriptor,
  readDescriptor,
  type Descriptor,
  type DescriptorCandidate,
  type Os,
  type ProjectEntry,
} from './descriptor/schema.ts'
export {
  DUPLICATE_ENTRY,
  IN_USE,
  NO_PRUNE_TOOL,
  descriptorPlugin,
  globMatches,
  osOf,
  pathProblem,
  skipReason,
  type DescriptorOptions,
} from './descriptor/engine.ts'
export {
  BUILT_IN_VARS,
  VAR_COMMAND_LIMIT_MS,
  fillTemplate,
  resolveVars,
  type VarSource,
  type VarValue,
  type Vars,
  type VarsAt,
} from './descriptor/vars.ts'
export {
  DescriptorLoadError,
  SHIPPED_DESCRIPTORS,
  findDescriptors,
  loadDescriptors,
  type DescriptorProblem,
  type DescriptorSource,
  type DescriptorSources,
  type FoundDescriptors,
  type LoadedDescriptor,
} from './descriptor/load.ts'
export {
  CLOSE_TERMINALS,
  ORCA_BUNDLE_CLI,
  ORCA_PLUGIN,
  orcaPlugin,
  type OrcaOptions,
  type OrcaRecord,
} from './orca.ts'
export {
  AGENT_WORKTREE,
  CURSOR_WORKTREES,
  DEFAULT_AGENT_FOLDERS,
  agentFoldersOf,
} from './agent-folders.ts'
export {
  CURSOR_IN_USE,
  CURSOR_PLUGIN,
  CURSOR_STATE_UNREADABLE,
  CURSOR_UNKNOWN_WORKSPACE,
  VSCODE_IN_USE,
  VSCODE_PLUGIN,
  VSCODE_STATE_UNREADABLE,
  VSCODE_UNKNOWN_WORKSPACE,
  cursorPlugin,
  cursorUserDir,
  vscodePlugin,
  vscodeUserDir,
  type CursorOptions,
  type VscodeOptions,
} from './vscode.ts'
export {
  OLLAMA_IN_USE,
  OLLAMA_MODEL,
  OLLAMA_PLUGIN,
  OLLAMA_PS_FAILED,
  OLLAMA_UNREACHABLE,
  OLLAMA_USE_UNKNOWN,
  ollamaPlugin,
  type LoadedModel,
  type OllamaModel,
  type OllamaOptions,
} from './ollama.ts'

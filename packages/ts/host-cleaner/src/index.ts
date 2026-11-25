/**
 * `@osdlc/host-cleaner`: machine cleanup as plugins. A plugin proposes
 * candidates and objects to others'; the core runs the phases in the order
 * the plugins are given, with one flat plan and one receipt. The `git` plugin
 * is repo-cleaner. Everything `./plugin.ts` exports is exported here too.
 */

export { VERSION } from './version.generated.ts'
export * from './plugin.ts'
export { DROP_REASONS, type DropReason } from './types.ts'
export { BUILT_IN_PLUGINS } from './registry.ts'
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
  UNMEASURED,
  checkSelection,
  clean,
  decide,
  decidePlan,
  plan,
  recheck,
  spares,
  survey,
  type CleanOptions,
  type Decision,
  type Selection,
  type Survey,
} from './run.ts'
export { PERSONAL_FOLDERS } from './roots.ts'
export { gitDefinitionWith, gitPlugin, type GitPluginOptions } from './git.ts'
export { cargoPlugin, CARGO_PLUGIN } from './cargo.ts'
export { nodePlugin, NODE_PLUGIN } from './node.ts'
export { type ArtifactOptions } from './artifacts.ts'
export {
  CLOSE_TERMINALS,
  ORCA_BUNDLE_CLI,
  ORCA_PLUGIN,
  orcaPlugin,
  type OrcaOptions,
  type OrcaRecord,
} from './orca.ts'

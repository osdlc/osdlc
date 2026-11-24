/**
 * `@osdlc/host-cleaner`: machine cleanup as plugins. A plugin proposes
 * candidates and objects to others'; the core runs the phases in the order
 * the plugins are given, with one flat plan and one receipt. The `git` plugin
 * is repo-cleaner.
 */

export { VERSION } from './version.generated.ts'
export {
  COST_DESCRIPTIONS,
  DROP_REASONS,
  FatalRun,
  HOOKS,
  LEVELS,
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type CostDescription,
  type Ctx,
  type Detection,
  type DropReason,
  type Hook,
  type Level,
  type MaybePromise,
  type Objection,
  type PathCandidate,
  type Plugin,
  type PluginDefinition,
  type PluginInit,
  type RefCandidate,
  type Root,
  type RunCtx,
} from './types.ts'
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
export { PERSONAL_FOLDERS, containedIn } from './roots.ts'
export { gitPlugin, type GitPluginOptions } from './git.ts'
export { cargoPlugin, CARGO_PLUGIN } from './cargo.ts'
export { nodePlugin, NODE_PLUGIN } from './node.ts'
export { toolchainsDefinition, TOOLCHAINS_PLUGIN } from './toolchains.ts'
export { type ArtifactOptions } from './artifacts.ts'
export {
  DEFAULT_IDLE_HOURS,
  MEASURE_BUDGET_MS,
  RUN_LIMIT_MS,
  commandHasName,
  idleHoursSetting,
  pluginKit,
  type CandidateFields,
  type Idle,
  type Kit,
  type KitOptions,
  type KitRunOptions,
  type KitRunResult,
  type Running,
} from './kit.ts'
export {
  CLOSE_TERMINALS,
  ORCA_BUNDLE_CLI,
  ORCA_PLUGIN,
  orcaPlugin,
  type OrcaOptions,
  type OrcaRecord,
} from './orca.ts'

/**
 * `@osdlc/host-cleaner`: machine cleanup as plugins. A plugin proposes
 * candidates and objects to others'; the core runs the phases in a fixed
 * plugin order with one flat plan and one receipt. The `git` plugin is
 * repo-cleaner.
 */

export { VERSION } from './version.generated.ts'
export {
  DROP_REASONS,
  FatalRun,
  LEVELS,
  type Candidate,
  type Ctx,
  type DropReason,
  type Level,
  type Objection,
  type Plugin,
} from './types.ts'
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
  PLUGIN_ORDER,
  clean,
  decide,
  decidePlan,
  orderPlugins,
  plan,
  recheck,
  survey,
  type CleanOptions,
  type Decision,
  type Survey,
} from './run.ts'
export { gitPlugin, type GitPluginOptions } from './git.ts'
export { cargoPlugin, CARGO_PLUGIN } from './cargo.ts'
export { nodePlugin, NODE_PLUGIN } from './node.ts'
export { DEFAULT_IDLE_HOURS, type ArtifactOptions } from './artifacts.ts'

/**
 * `@osdlc/host-cleaner` — machine cleanup over `@osdlc/repo-cleaner`.
 *
 * `hostSweep` is repo-cleaner's sweep with each detected adapter's verdicts
 * chained into it, plus the rows the adapters own. `hostPlan`, `hostCheck`
 * and `hostRun` carry both kinds of row through one plan, one re-check and
 * one receipt, under repo-cleaner's safety model: a fingerprint per row, a
 * re-check when the run starts, risks granted by name, a verified step.
 *
 * An adapter is optional: it detects itself and is skipped when absent. With
 * none active the result is repo-cleaner's.
 */

export {
  HostCleanerError,
  type HostAdapter,
  type HostConfig,
  type HostContext,
  type HostErrorCode,
  type HostRow,
  type HostStep,
} from './adapter.ts'
export type { HostOptions } from './options.ts'
export {
  chainAnnotate,
  chainRemoveWorktree,
  makeContext,
  resolveAdapters,
  type AdapterReport,
  type Selection,
  type SkipReason,
} from './registry.ts'
export { gatherHostRows, hostSweep, type HostSweep, type HostSweepOptions } from './sweep.ts'
export {
  HOST_PLAN_VERSION,
  HostPlanSchema,
  hostPlan,
  parseHostPlan,
  readHostPlan,
  writeHostPlan,
  type HostPlan,
  type HostPlanRow,
} from './plan.ts'
export {
  HOST_RECEIPT_VERSION,
  hostCheck,
  hostRun,
  selectHostRows,
  type HostAllow,
  type HostApproval,
  type HostCheckOptions,
  type HostDropped,
  type HostPreview,
  type HostReceipt,
  type HostResolved,
  type HostRunOptions,
  type HostStepRecord,
} from './clean.ts'
export { CARGO_ADAPTER, cargoAdapter, incrementalOff } from './cargo.ts'
export { NODE_ADAPTER, nodeAdapter } from './node.ts'
export { DEFAULT_IDLE_HOURS } from './artifacts.ts'
export {
  ORCA_ADAPTER,
  ORCA_BUNDLE_CLI,
  ORCA_UNREACHABLE,
  createOrcaAdapter,
  orcaAdapter,
  type OrcaOptions,
  type OrcaWorktree,
} from './orca.ts'

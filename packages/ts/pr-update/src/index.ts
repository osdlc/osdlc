/**
 * `@osdlc/pr-update` — survey and update out-of-date, stacked pull
 * requests, as a library. A host builds a `PrUpdateConfig` and a `Ports` and
 * calls `runSurvey`/`runUpdate` directly; the `pr-update` binary
 * (`src/cli.ts`) is one particular host, not a required layer in front of
 * these. A host that keeps this package's config blocks in its own file passes
 * that file's `{ name, envVar }` to `loadConfigLayers`.
 */

export {
  prUpdateConfigSchema,
  prUpdateStandaloneSchema,
  prUpdateSection,
  prUpdateStandaloneSection,
  DEFAULT_PR_UPDATE_CONFIG,
  type PrUpdateConfig,
  type PrUpdateStandaloneConfig,
} from './config.ts'
export {
  STANDALONE_SECTIONS,
  loadConfigLayers,
  standaloneConfig,
  type ConfigFileSpec,
  type LoadEnv,
  type StandaloneConfig,
} from './config-file.ts'
export { selectedCodeHostFor } from './code-host.ts'
export { EXIT_UNTRUSTED, projectSourcedCommands, untrustedMessage } from './trust.ts'
export { repairPrompt } from './repair/prompt.ts'
export {
  REPAIR_AGENTS,
  REPAIR_AGENT_SUMMARIES,
  agentRepair,
  planRepair,
  repairCallSpec,
  type AgentRepairOptions,
  type CallAgent,
  type RepairAgent,
} from './repair/agents.ts'
export { commandRepair, standalonePorts } from './defaults.ts'
export { attemptFile, attemptsDir, fileAttemptStore, listAttempts } from './update/attempts.ts'
export { formatPreview, terminalConfirmPush } from './update/confirm.ts'
export type {
  AttemptKey,
  AttemptRecord,
  AttemptStore,
  ConfirmPush,
  Generator,
  Ports,
  PushPreview,
  Repair,
  RepairKind,
  RepairRequest,
  RepairResult,
  RunVerb,
  VerifyWhich,
} from './ports.ts'

export {
  branchMatchesGlob,
  chooseStrategy,
  matchOverride,
  type Strategy,
  type StrategyDecision,
  type StrategySignals,
} from './strategy.ts'

export {
  measure,
  nearestBehindAncestor,
  num,
  parentEdges,
  renderSurveyText,
  repoFailuresOf,
  resolveTargets,
  runSurvey,
  statusFor,
  surveyRows,
  topoOrder,
  unpushedLocalWork,
  scopeToPrs,
  SCOPE_SHAPE,
  SurveyUsageError,
  row as surveyRowSchema,
  output as surveyOutputSchema,
  type MergePrediction,
  type RepoTarget,
  type SurveyArgs,
  type SurveyEnv,
  type SurveyReport,
  type SurveyRow,
  type SurveyStatus,
} from './survey.ts'

export {
  applyStrategyOverride,
  attemptKey,
  renderUpdateText,
  runUpdate,
  selectTargets,
  toResult,
  syncLocalCheckout,
  UpdateUsageError,
  wantsWrite,
  input as updateInputSchema,
  output as updateOutputSchema,
  result as updateResultSchema,
  type FailedAttemptPolicy,
  type LocalCheckout,
  type SkippedPr,
  type UpdateArgs,
  type UpdateEnv,
  type UpdateOutput,
} from './update.ts'

export {
  describeOutcome,
  isStalePush,
  tally,
  updateAll,
  updateOne,
  WORK_BRANCH,
  scratchBranch,
  type Repaired,
  type UpdateOutcome,
  type UpdateResult,
  type UpdateSettings,
  type UpdateTarget,
} from './update/execute.ts'

export {
  generatorNames,
  isLockfile,
  matchRegenerate,
  planPaths,
  rebuildVerbs,
  unclaimed,
  type PathPlan,
  type RegenerateRule,
} from './update/resolvers.ts'

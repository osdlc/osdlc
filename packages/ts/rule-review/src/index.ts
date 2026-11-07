/**
 * `@osdlc/rule-review`: review a changeset against the rule files that govern it.
 *
 * Every rule source declares the paths it governs. Intersecting those scopes
 * with a changeset gives the judgements worth running, and each one is made
 * by a headless agent over only the files its source governs.
 *
 * Start with {@link reviewChanges}. {@link review} is the same run with the
 * inputs supplied by the caller. The check-folder runner (`readCheckFolder`,
 * `runChecks` and the items after them) is experimental.
 */

// Reviewing a change.
export {
  ChangesetError,
  reviewChanges,
  type ChangesReview,
  type ReviewChangesOptions,
} from './review-changes.ts'
export { discoverSources, review, type Dispatch, type ReviewOptions } from './run.ts'
export { planJobs, type PlanResult } from './plan.ts'
export { ScopeError } from './select.ts'
export { buildSpec, FINDINGS_SCHEMA, type FileDiff } from './prompt.ts'
export { exitCodeFor, meetsFloor } from './findings.ts'
export { estimateTokens, formatTokens, jobLabel } from './tokens.ts'
export type {
  DiscoveryContext,
  Finding,
  JobOutcome,
  ReviewConfig,
  ReviewJob,
  ReviewRun,
  RuleSource,
  RuleSourceProvider,
  Severity,
} from './types.ts'
export { DEFAULT_CONFIG, SEVERITY_ORDER } from './types.ts'

// Rule sources.
export {
  instructionFiles,
  INSTRUCTION_KIND,
  type FileLister,
  type InstructionFilesOptions,
} from './providers/instruction-files.ts'

// Reading the changeset out of git.
export {
  changedFiles,
  defaultBase,
  fileDiffs,
  resolveBase,
  stagedFiles,
  trackedFiles,
  type Changeset,
  type Repo,
} from './changeset.ts'

// Check folders. Experimental: the items below may change in a minor release.
export {
  DEFAULT_TIMEOUT_SEC,
  readCheckFolder,
  type Check,
  type CheckFolder,
  type PromptCheck,
  type ScriptCheck,
  type SkippedEntry,
} from './providers/check-folder.ts'
export {
  checksExitCode,
  formatPlan,
  formatReport,
  planChecks,
  runChecks,
  runToJson,
  summarize,
  type CheckResult,
  type ChecksPlan,
  type ChecksRun,
  type CheckStatus,
  type RunChecksOptions,
} from './checks.ts'

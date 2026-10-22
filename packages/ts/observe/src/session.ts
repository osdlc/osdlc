/**
 * The session entry: the record of an agent session a launcher starts. An
 * append-only event log per session reduces to a record through a fixed state
 * machine; the env tags a launched agent carries are read back by a process
 * scan; reconcile ends a record whose session is gone. The harness, host and
 * launch-flag vocabularies are the consumer's: {@link defineSessionModel} builds
 * the model from them.
 */

export {
  defineSessionModel,
  EVENTS_FILE,
  isLegalTransition,
  looseSessionModel,
  RECORD_FILE,
  SESSION_CAPTURES,
  SESSION_DONE_OUTCOMES,
  SESSION_OUTCOMES,
  SESSION_RUN_STATES,
  SessionCaptureSchema,
  SessionDoneOutcomeSchema,
  SessionDoneSchema,
  sessionEventsPath,
  SessionKindSchema,
  SessionLaunchedSchema,
  SessionLogError,
  SessionNameSourceSchema,
  SessionOriginSchema,
  SessionOutcomeSchema,
  SessionParentSchema,
  SessionRunStateSchema,
  UsageSampleSchema,
  type AnySessionRecord,
  type IgnoredEventOf,
  type NewSessionEventOfModel,
  type SessionAuthorOf,
  type SessionCapture,
  type SessionDone,
  type SessionDoneOutcome,
  type SessionEventOfModel,
  type SessionKind,
  type SessionLaunched,
  type SessionModel,
  type SessionNameSource,
  type SessionOrigin,
  type SessionOutcome,
  type SessionParent,
  type SessionRecordOf,
  type SessionRecordOfModel,
  type SessionReductionOf,
  type SessionRunState,
  type SessionVocabulary,
  type UsageSample,
} from './model.ts'

export {
  AUTHOR_ENV_VAR,
  authorFromEnv,
  PINNED_CMD_ENV_VAR,
  PROJECT_ROOT_ENV_VAR,
  SESSION_ID_RE,
  sessionEnv,
  TASK_ENV_VAR,
  type SessionEnv,
} from './env.ts'

export {
  liveSessionIds,
  processScanSupported,
  scanTaggedProcesses,
  type LiveIds,
  type TaggedProcess,
} from './process-scan.ts'

export { runStateForStatus, type AgentStatus } from './status.ts'

export {
  BACKFILL_STATUSES,
  decideReconcile,
  DEFAULT_GRACE_MS,
  endedAsLost,
  reconcileSessions,
  type BackfillStatus,
  type ReconcilableRecord,
  type ReconcileDecision,
  type ReconcileDeps,
  type ReconcileEvidence,
  type ReconcileReport,
  type ReconcileRow,
  type ReconcileVerdict,
} from './reconcile.ts'

export {
  endSession,
  resolveLineage,
  resolveRun,
  runHeadlessSession,
  runInteractiveSession,
  type HostOpened,
  type InteractiveResult,
  type InteractiveRun,
  type LifecycleEvent,
  type LifecyclePorts,
  type RunContext,
} from './lifecycle.ts'

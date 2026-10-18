---
'@osdlc/observe': patch
---

The first release on npm. Earlier versions were used only during development and were never published, so this entry lists everything the package does. See what a running system of tools and agents is
doing, and what it did, from plain files: one JSONL log envelope with correlation ids that flow to child
processes, a stable machine id, and the record of an agent session that a launcher starts (an
append-only event log per session that reduces to a record, the session state machine, the
environment tags a launched agent carries, a process scan that reads them back, and the decision
that ends a record whose session is gone).

- Two entry points. `@osdlc/observe` holds the log envelope, correlation ids and their environment
  tags, sortable ids, the JSONL writer and readers, the machine id and the originator.
  `@osdlc/observe/session` holds the session model and record, the state machine, the session
  environment tags, the process scan, hook status, reconcile and the lifecycle runner.
- `SessionEventOfModel`, `NewSessionEventOfModel` and `SessionRecordOfModel` name the event, new
  event and record types of a model: `SessionEventOfModel<typeof model>`.
- `sessionEnv` takes an optional `machine`, `reconcileSessions` an optional `machine` in its deps,
  and `isThisMachine` an optional second argument, so a caller can avoid the implicit
  `machineId()` call and its side effects, which its TSDoc now lists.
- Stability tiers. The reconcile run (`reconcileSessions`, `ReconcileDeps`, `ReconcileRow`,
  `ReconcileReport`, `BACKFILL_STATUSES`, `BackfillStatus`) and the lifecycle runner
  (`runHeadlessSession`, `runInteractiveSession`, `endSession`, `resolveRun`, `resolveLineage`,
  `LifecycleEvent`, `LifecyclePorts`, `HostOpened`, `InteractiveRun`, `InteractiveResult`,
  `RunContext`) are tagged `@experimental` and may change in a minor release. Everything else is
  stable for 0.x. A new value in a closed union (`SessionRunState`, `SessionOutcome`,
  `SessionOrigin`, `LogSource`, `AgentStatus`) is a breaking change.
- TSDoc on every export, with `@throws` on `appendJsonl`, `readJsonl`, `runHeadlessSession` and
  `runInteractiveSession`.
- Runnable examples for every export, a test of the exports, and a README.
- Node.js 22 or later is supported (`engines.node`), and the tests run under Vitest on Node. Linux
  and macOS are supported; on Windows the record works and the process scan reports that it
  cannot tell.

- Breaking: the environment tags are named `OBSERVE_*`: `OBSERVE_SESSION`, `OBSERVE_RUN`,
  `OBSERVE_SUBJECT`, `OBSERVE_INVOCATION`, `OBSERVE_INVOCATION_PID`, `OBSERVE_TASK`,
  `OBSERVE_PROJECT_ROOT`, `OBSERVE_PINNED_CMD`, `OBSERVE_AUTHOR` and `OBSERVE_MACHINE_ID`. The
  `*_ENV_VAR` constants hold the new names. They were named `SDLC_*`. `sessionEnv` sets both
  names, and every reader takes the `OBSERVE_` value, or the old name when the two differ, so
  processes on either side of the change still see each other.
- Breaking: the record and `launched` event keys `engine`, `claudeFlags` and `sdlcPin` are now
  `harness`, `launchFlags` and `pin`, matching the `SessionVocabulary` keys. The schemas read the
  old keys as the new ones, so an existing store loads unchanged; new events and records are written
  with the new keys. `ReconcilableRecord` and `ReconcileRow` use `harness`, and `sessionEnv` takes
  `pin`.
- Breaking: `zod` is a peer dependency (`^4`), since the session model takes the consumer's zod
  schemas and returns zod schemas.
- Breaking: the `types` carrier on a model is gone; use the helper types above.
- Breaking: `parseJsonlLines`, `lineageFromEnv`, `parsePsEnvironment`, `resolveMachineId` and
  `reconcileCause` are no longer exported, and `LOST_HOOK_NOTE` is removed (it is a consumer's
  message).
- The machine id's hash seeds and its cache file (`~/.cache/sdlc/machine-id`) are unchanged, so
  every machine keeps its id.
- The docs no longer refer to a particular host project.

- Process spawning goes through `@osdlc/command-seam`. No API change.

# Changelog

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.3.2] - 2026-10-16 (unpublished)

#### Changed

- `runHeadlessSession` accepts a result with `timedOut: true` and ends the record with outcome
  `timeout`. Its `onEnd` callback reports a timeout as `failed`.

### [0.3.1] - 2026-10-11 (unpublished)

#### Changed

- A `resumed` event reopens an ended session for a new run of the same harness session: the state
  goes back to `starting`, `endedAt`, `exitCode` and the outcome are cleared, and `host` and `pid`
  are refreshed. On a session that has not ended, the reducer ignores it as an illegal transition.

### [0.3.0] - 2026-10-11 (unpublished)

#### Added

- `SESSION_DONE_OUTCOMES`, `SessionDoneOutcomeSchema`, `SessionDoneSchema` and the types
  `SessionDoneOutcome` and `SessionDone`.

#### Changed

- Breaking: a new session state, `done`. A `done` event (the agent declares its work finished,
  `ok` or `failed`, with a note or `null`) moves `running`, `waiting_for_input` or `idle` to
  `done` and sets the record's `done` field. A new prompt (`running`) clears it. Code that handles
  every `SessionRunState` must now handle `done`.
- A `pid_recorded` event records the pid of the process that runs an interactive session. A later
  `host_attached` with no pid keeps it.

### [0.2.1] - 2026-10-11 (unpublished)

#### Added

- `AUTHOR_ENV_VAR` (then `SDLC_AUTHOR`) and `authorFromEnv`. `sessionEnv` takes an `author` text and
  sets the tag, or sets it empty so a parent's value does not leak.

### [0.2.0] - 2026-10-11 (unpublished)

#### Added

- The log envelope: `LogEnvelopeSchema`, `LOG_ENVELOPE_VERSION`, `LOG_SOURCES`,
  `correlationFromEnv`, `lineageFromEnv`, `newSortableId`, `newRunId`, and the correlation tags,
  then named `SDLC_RUN`, `SDLC_SUBJECT`, `SDLC_INVOCATION` and `SDLC_INVOCATION_PID`.
- The JSONL writer and reader: `appendJsonl` (one `O_APPEND` write per line, optional fsync, a torn
  last line repaired), `parseJsonl`, `parseJsonlLines`, `readJsonl`, `readJsonlFrom` (reads only
  what was appended after an offset) and `jsonlSize`.
- The session model: `defineSessionModel` builds the event and record schemas, the reducer and the
  file functions over the consumer's harness, host and launch-flag schemas. Every append re-reduces
  the whole log and rewrites `record.json`, so a stale projection never overwrites a newer one.
  `looseSessionModel` reads any vocabulary. Also the state machine (`isLegalTransition`), the
  vocabulary schemas and types, `SessionLogError`, `EVENTS_FILE`, `RECORD_FILE` and
  `sessionEventsPath`.
- Session names: a person's rename wins over the launch name, which wins over a title the harness
  generated (`SessionNameSourceSchema`).
- `sessionEnv`, the environment tags a launcher sets on an agent process, with `SESSION_ENV_VAR`,
  `TASK_ENV_VAR`, `PROJECT_ROOT_ENV_VAR`, `PINNED_CMD_ENV_VAR` and `SESSION_ID_RE`.
- A stable machine id: `machineId()` is `m-` plus 16 hex characters derived from the platform's
  machine UUID (macOS, Linux, Windows), or from the hostname when no UUID can be read. The UUID is
  never written. It is resolved once per process, handed to child processes through
  `MACHINE_ENV_VAR`, and cached in a file. Also `deriveMachineId`, `MachineProbe` and
  `isThisMachine`.
- `resolveOriginator` records who started a session (git `user.name`, else the OS login), the
  hostname and the time zone; with `identity` off it records the time zone only.
- `runStateForStatus` and `AgentStatus`: the session state a harness hook status reports.
- Reconcile: `decideReconcile` ends a record as `lost` only when no process carries the session id,
  no host pane is open (or there is no host to ask) and the grace period has passed. A failed scan
  or host probe never ends a record. `reconcileSessions` runs it over a store through injected
  probes. Also `endedAsLost`, `DEFAULT_GRACE_MS` and the report types.
- The start lifecycle behind ports: `runHeadlessSession`, `runInteractiveSession`, `endSession`,
  `resolveRun` and `resolveLineage`. A failed spawn or open still ends the record `failed`.

#### Changed

- Breaking: `scanTaggedProcesses` returns `null` when the scan could not run (unsupported platform,
  `ps` failed, `/proc` unreadable), and `parsePsEnvironment` returns `null` when a tagged process
  changed its command line between the two `ps` snapshots. Before, both returned `[]`. Treat
  `null` as "could not tell", not as "none running".
- The macOS scan reads plain command lines only for the processes that carry a tag.

### [0.1.0] - 2026-10-06 (unpublished)

#### Added

- The process scan: `scanTaggedProcesses` finds running processes tagged with a session id (then
  `SDLC_SESSION`) and task (then `SDLC_TASK`) by reading their environment, through `ps -E` on macOS
  and `/proc` on Linux. Also `parsePsEnvironment`, `processScanSupported`, `TaggedProcess`,
  `LiveIds` and `liveSessionIds`.

# @osdlc/observe

## 0.4.1

### Patch Changes

- Updated dependencies [da5e6a3]
  - @osdlc/command-seam@0.14.0

## 0.4.0

### Minor Changes

- b835ae4: Behaviour change: the machine-id cache (`~/.cache/sdlc/machine-id`) is now keyed by a hash of the hostname, so machines that share a home directory no longer share an id. On upgrade the id is derived once more and the cache rewritten in the new form; an id set through `OBSERVE_MACHINE_ID` is unaffected. A relative `XDG_CACHE_HOME` is ignored, as the XDG spec says.
  A tag inside another variable's value in `/proc/<pid>/environ` (`CMD=run OBSERVE_SESSION=x`) is no longer read as a session tag. Reconcile no longer throws on a session whose `startedAt` does not parse.
  `record.json` is now written through `@osdlc/etag-write` (a new runtime dependency): the temp file is fsynced before the rename, removed when the write fails, and named uniquely per write rather than per process, and the directory is fsynced after the rename. The record's mode is now exactly `0o600` whatever the umask.
  Behaviour change (stricter): the machine-id probes (`ioreg` and the like), `git config user.name` for the originator, and the `ps` scan of live sessions run their binary only from an absolute `PATH` entry, so a binary in the repository the process runs in is never run.
  The machine-id cache path is now resolved by `@osdlc/tiered-dirs` (a new runtime dependency): `xdgBaseDirs` for `$XDG_CACHE_HOME` and `homeDir` for the home. Behaviour change: a relative `HOME` now falls back to the OS account's home (before, the cache was skipped); an `XDG_CACHE_HOME` with surrounding whitespace is ignored rather than trimmed; on Windows an `XDG_CACHE_HOME` with a drive letter is ignored and the cache stays under `~/.cache`.

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
  - @osdlc/command-seam@0.13.0
  - @osdlc/etag-write@0.3.0
  - @osdlc/tiered-dirs@0.5.0

## 0.3.12

### Patch Changes

- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
  - @osdlc/command-seam@0.12.0

## 0.3.11

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0

## 0.3.10

### Patch Changes

- Updated dependencies [910deca]
  - @osdlc/command-seam@0.10.0

## 0.3.9

### Patch Changes

- 3a886e7: Add an optional `task` field to the `launched` event and to the session record. It holds the basename of the task the session works on. The reducer copies it to the record. When `task` is `null` or missing, the record has no `task`, so older logs still read.

## 0.3.8

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
  - @osdlc/command-seam@0.9.0

## 0.3.7

### Patch Changes

- Updated dependencies [ac5f0d1]
  - @osdlc/command-seam@0.8.0

## 0.3.6

### Patch Changes

- Updated dependencies [ce3bf64]
  - @osdlc/command-seam@0.7.0

## 0.3.5

### Patch Changes

- Updated dependencies [778129e]
  - @osdlc/command-seam@0.6.0

## 0.3.4

### Patch Changes

- 4f3fb00: README: clarify reconcile on Windows.

## 0.3.3

### Patch Changes

- 8bf138a: The first release on npm. Earlier versions were used only during development and were never published, so this entry lists everything the package does. See what a running system of tools and agents is
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

# @osdlc/observe

`@osdlc/observe` lets you see what a running system of tools and agents is
doing, and what it did, from plain files on disk. It is not the unscoped npm
package `agent-session`, which is an unrelated project.

## The problem

A tool that runs agents starts work that runs on its own: ops and CLI
commands, and agent sessions (an agent CLI working a task, in the background or
in a terminal tab). Some of that work starts more work: an op launches a
session, and the session's tools run more ops. Later you want to answer: what
ran, which run started which, which session is still alive, and how did each one
end? A process can crash or be killed before it writes its last line, so the
answer cannot rely on every process ending cleanly.

## How it works

1. **One line format for everything.** Every event is one JSON line with the
   same envelope: version, time, kind, the machine that wrote it, its source
   (`op`, `cli`, `launcher`, `hook`, `digest`), and correlation ids: the run,
   the session and the subject. The JSONL writer appends each line in one
   write, so two processes on one machine do not interleave or lose a line, and
   it repairs a torn last line.
2. **Context flows to child processes.** When a run or a session starts a
   process, it passes its ids down as `OBSERVE_*` environment variables.
   Anything the child logs carries the same ids, so a reader can join the logs
   of a whole tree of work.
3. **Sessions get a record.** Each agent session has a folder with an
   append-only `events.jsonl` (launched, attached, resumed, ended...). A reducer
   turns those events into `record.json`: one current state per session, from a
   fixed state machine. The record is rebuilt from the whole log each time, so
   stale state never overwrites newer state.
4. **Liveness is checked, not assumed.** A process scan reads the tags back
   from the processes running on the machine. Reconcile compares the records
   with what is actually running and ends a record whose process is gone as
   `lost`. If the scan cannot tell, it leaves the record alone.

It is for launchers and orchestrators that start agent CLIs and other
long-running work, and for the dashboards and reports that read what they
wrote.

## When not to use it

- It does not launch agents, talk to terminals, install hooks or read
  transcripts. Your launcher does those and calls this package through small
  ports.
- It does not send metrics or traces anywhere. It writes local files that
  other tools read. For distributed tracing, use OpenTelemetry.
- It keeps no database. A store with many thousands of sessions is a folder
  per session; index it yourself if you need fast queries.
- It does not normalise transcripts; a transcript library does that.

## How it compares

- **`@deepseek-ai/dsh-session`** is an event-sourced session store for one
  harness. This package keeps the same kind of event log, but the harness,
  host and launch-flag vocabulary are yours, and it adds the env tags, the
  process scan and reconcile.
- **Transcript normalisers** (`agent-session-format`, `txcript`) read what an
  agent said. This package records what a session did and whether it is still
  running, and leaves transcripts to them.
- **The `agent-session` crate** (Rust) parses transcripts and matches agent
  processes. The process scan here does the matching through env tags that
  the launcher sets.
- **`ulid`, `ulidx`.** `newSortableId` uses the ULID layout with a prefix, so
  the package needs no ULID dependency.

## Install

```sh
npm install @osdlc/observe zod
```

`pnpm add @osdlc/observe` and `yarn add @osdlc/observe` work too.

ESM only. Node.js 22 or later. `zod` 4 is a peer dependency:
the session model takes your own zod schemas, so both must come from one zod.
The one runtime dependency is `@osdlc/command-seam`, which runs `ps`, `ioreg`,
`reg` and `git` without a shell.

## Entry points

| Import | Holds |
|---|---|
| `@osdlc/observe` | The log envelope, correlation ids and their env tags, sortable ids, the JSONL writer and readers, the machine id and the originator. |
| `@osdlc/observe/session` | The session record: the model over your vocabulary, the state machine, the session env tags, the process scan, hook status, reconcile and the lifecycle runner. |

## Quick start

Log a line that joins the run its process was started in:

```ts
import { appendJsonl, correlationFromEnv, LogEnvelopeSchema, machineId, readJsonl } from '@osdlc/observe'

// A child process launched inside a run inherits its tags.
const env = { OBSERVE_RUN: 'r-01JABCDEFGHJKMNPQRSTVWXYZ0', OBSERVE_SUBJECT: 'issue-42' }

const line = LogEnvelopeSchema.extend({ kind: z.literal('build.done'), ok: z.boolean() }).parse(
  {
    v: 1,
    ts: new Date().toISOString(),
    kind: 'build.done',
    writer: machineId(),
    source: 'op',
    ...correlationFromEnv(env),
    ok: true,
  },
)
appendJsonl(join(store, 'ops.jsonl'), line)
```

Keep a record of an agent session. The vocabulary (which harnesses, hosts and
launch flags exist) is yours:

```ts
import { defineSessionModel, sessionEnv } from '@osdlc/observe/session'

const model = defineSessionModel({
  harness: z.enum(['aider', 'goose']),
  host: z.enum(['terminal', 'tmux']),
  launchFlags: z.object({ yolo: z.boolean() }),
})

const id = crypto.randomUUID()
const dir = join(store, id)
model.recordSessionEventIn(
  dir,
  {
    kind: 'launched',
    id,
    harness: 'aider',
    sessionKind: 'headless',
    origin: { kind: 'person' },
    author: { tool: 'aider', requested: null, model: null, effort: null },
    host: null,
    cwd: '/work/repo',
    branch: 'main',
    launched: { kind: 'prompt', text: 'Fix the failing test.' },
    operation: null,
    machine: machineId(),
  },
  new Date().toISOString(),
)

// The environment the agent process runs with: its tools and the process
// scan read the session id back from it.
const childEnv = { ...process.env, ...sessionEnv({ id }) }

model.recordSessionEventIn(
  dir,
  { kind: 'state_changed', from: 'starting', to: 'running', cause: 'spawn' },
  new Date().toISOString(),
)
const record = model.readSessionRecordIn(dir)
```

Every snippet in this README is taken from `examples/`, which the test suite
runs.

## API

Every export has TSDoc; the `.d.ts` files are the reference. An overview:

### `@osdlc/observe`

- **Envelope.** `LogEnvelopeSchema` and `LogEnvelope`, `LOG_ENVELOPE_VERSION`,
  `LOG_SOURCES`, `LogSourceSchema` and `LogSource`. Extend the schema with a
  literal `kind` and your fields for each event you log.
- **Correlation.** `correlationFromEnv` reads `Correlation` (session, run,
  subject) from an environment. The tag names are `SESSION_ENV_VAR`,
  `RUN_ENV_VAR`, `SUBJECT_ENV_VAR`, `INVOCATION_ENV_VAR` and
  `INVOCATION_PID_ENV_VAR`.
- **Ids.** `newSortableId(prefix)` and `newRunId()`: ids that sort by the time
  they were minted.
- **JSONL.** `appendJsonl` (with `AppendOptions`), `parseJsonl`, `readJsonl`,
  `readJsonlFrom` (returns a `JsonlTail`: only what was appended after an
  offset) and `jsonlSize`.
- **Machine.** `machineId()`, `isThisMachine`, `MACHINE_ENV_VAR`,
  `deriveMachineId` over a `MachineProbe`, and `resolveOriginator` over an
  `OriginatorProbe`, which returns an `Originator`.

```ts
import { deriveMachineId, type MachineProbe } from '@osdlc/observe'

const linux: MachineProbe = {
  platform: 'linux',
  readFile: (path) =>
    path === '/etc/machine-id' ? '4c4c4544004b4e10804eb7c04f304b32\n' : null,
  run: () => null,
  hostname: () => 'laptop.local',
}

const id = deriveMachineId(linux)
```

`machineId()` has side effects. It reads `OBSERVE_MACHINE_ID` (or
`SDLC_MACHINE_ID`) from `process.env`; when that is unset it reads the cache
file `~/.cache/sdlc/machine-id` (under `$XDG_CACHE_HOME` when set); when that
holds no id it probes the platform (it spawns `ioreg` on macOS or `reg` on
Windows, and reads `/etc/machine-id` on Linux) and writes the cache file. It
resolves once per process. `sessionEnv`, `isThisMachine` and the reconcile run
take a machine id, so a caller can avoid the implicit call.

### `@osdlc/observe/session`

- **Model.** `defineSessionModel(vocabulary)` takes a `SessionVocabulary` (your
  harness, host and launch-flag schemas) and returns a `SessionModel`: the
  event and record schemas, `reduceSessionEvents`, `appendSessionEvent`,
  `parseSessionEvents`, `readSessionEvents`, `tailSessionEvents`,
  `recordSessionEventIn`, `recordSessionEventAppliedIn` and
  `readSessionRecordIn`. Name its types with `SessionEventOfModel`,
  `NewSessionEventOfModel` and `SessionRecordOfModel`. `looseSessionModel`
  accepts any vocabulary, for a reader that must read logs from any writer.
  The record and its parts: `SessionRecordOf`, `AnySessionRecord`,
  `SessionAuthorOf`, `SessionReductionOf`, `IgnoredEventOf`. Files:
  `EVENTS_FILE`, `RECORD_FILE`, `sessionEventsPath`. `SessionLogError` is
  thrown when a log keeps growing while it is projected.
- **State machine and vocabulary.** `SESSION_RUN_STATES`,
  `SessionRunStateSchema`, `SessionRunState` and `isLegalTransition`;
  `SESSION_OUTCOMES`, `SessionOutcomeSchema`, `SessionOutcome`;
  `SESSION_CAPTURES`, `SessionCaptureSchema`, `SessionCapture`;
  `SESSION_DONE_OUTCOMES`, `SessionDoneOutcomeSchema`, `SessionDoneOutcome`,
  `SessionDoneSchema`, `SessionDone`; `SessionKindSchema`, `SessionKind`;
  `SessionLaunchedSchema`, `SessionLaunched`; `SessionOriginSchema`,
  `SessionOrigin`; `SessionParentSchema`, `SessionParent`;
  `SessionNameSourceSchema`, `SessionNameSource`; `UsageSampleSchema`,
  `UsageSample`.
- **Env tags.** `sessionEnv` returns the `SessionEnv` to set on an agent
  process. Also `SESSION_ID_RE`, `TASK_ENV_VAR`, `PROJECT_ROOT_ENV_VAR`,
  `PINNED_CMD_ENV_VAR`, `AUTHOR_ENV_VAR` and `authorFromEnv`.
- **Process scan.** `scanTaggedProcesses` returns the `TaggedProcess` list, or
  `null` when it could not tell; `processScanSupported`; `liveSessionIds`, the
  default `LiveIds` probe.
- **Hook status.** `runStateForStatus` maps an `AgentStatus` to the state it
  reports.
- **Reconcile.** `decideReconcile` turns `ReconcileEvidence` into a
  `ReconcileDecision` with a `ReconcileVerdict`; `DEFAULT_GRACE_MS`;
  `endedAsLost`; `ReconcilableRecord`. The run over a store is experimental
  (below).

```ts
import { decideReconcile, DEFAULT_GRACE_MS, type ReconcileEvidence } from '@osdlc/observe/session'

const evidence: ReconcileEvidence = {
  process: false, // no running process carries the session id
  hostOpen: false, // the terminal host has no pane for it
  quietMs: 20 * 60_000, // nothing heard for 20 minutes
  graceMs: DEFAULT_GRACE_MS, // 15 minutes
}

const decision: ReconcileDecision = decideReconcile(evidence)
```

The scan takes a command runner, so a test can hand it `ps` output:

```ts
import type { CommandRunner } from '@osdlc/command-seam'
import { scanTaggedProcesses, type TaggedProcess } from '@osdlc/observe/session'

// `ps` as macOS prints it: the command line, then the environment.
const ps: CommandRunner = {
  run: (argv) => ({
    exitCode: 0,
    stderr: '',
    stdout: argv.includes('-E')
      ? '  4242 aider --yes OBSERVE_SESSION=s-1 OBSERVE_TASK=issue-42 HOME=/home/ada\n'
      : '  4242 aider --yes\n',
  }),
}

const found: TaggedProcess[] | null = scanTaggedProcesses(ps, { platform: 'darwin' })
```

## The format

The names below are the on-disk and environment format. Launchers that should
see each other's sessions must agree on them.

- **Environment tags.** `OBSERVE_SESSION`, `OBSERVE_RUN`, `OBSERVE_SUBJECT`,
  `OBSERVE_INVOCATION`, `OBSERVE_INVOCATION_PID`, `OBSERVE_TASK`,
  `OBSERVE_PROJECT_ROOT`, `OBSERVE_PINNED_CMD`, `OBSERVE_AUTHOR` and
  `OBSERVE_MACHINE_ID`. Before 0.3.3 each was named with an `SDLC_` prefix
  (`SDLC_SESSION` and so on). For now, writers (`sessionEnv`) set both names
  to one value, and readers (`correlationFromEnv`, `authorFromEnv`, the process
  scan, the lifecycle, `machineId`) take the `OBSERVE_` value, unless the
  `SDLC_` one is set to something else. Then the `SDLC_` value wins: a
  pre-0.3.3 launcher nested in a newer session sets only `SDLC_*`, and the
  inherited `OBSERVE_*` value is stale.
- **Record and `launched` event keys.** `harness`, `launchFlags` and `pin`.
  Before 0.3.3 they were `engine`, `claudeFlags` and `sdlcPin`. The schemas
  read the old keys as the new ones, so an existing store loads unchanged;
  what the package writes uses the new keys.
- **Machine id.** `m-` and 16 hex characters of a SHA-256 over the platform's
  machine UUID with the seed `sdlc-machine:` (or the hostname with the seed
  `sdlc-machine-host:` when no UUID can be read), cached in
  `~/.cache/sdlc/machine-id`. The seeds and the path keep their names so that
  machine ids do not change.
- **Closed lists.** `SessionRunState`, `SessionOutcome`, `SessionOrigin`,
  `LogSource` and `AgentStatus` are closed unions: a new value is a breaking
  change (a minor version while 0.x).

## Stability

The package is 0.x: a breaking change is a minor version. Everything is
stable for 0.x except the items below, which may change in any minor release.

The experimental exports:

`reconcileSessions`, `ReconcileDeps`, `ReconcileRow`, `ReconcileReport`,
`BACKFILL_STATUSES`, `BackfillStatus`, `runHeadlessSession`,
`runInteractiveSession`, `endSession`, `resolveRun`, `resolveLineage`,
`LifecycleEvent`, `LifecyclePorts`, `HostOpened`, `InteractiveRun`,
`InteractiveResult` and `RunContext`.

The lifecycle runner appends what a launcher writes between `launched` and
the end, behind ports the launcher supplies:

```ts
import { runHeadlessSession } from '@osdlc/observe/session'

const result = await runHeadlessSession(ports, async (onSpawn) => {
  onSpawn(4242) // the agent process started
  return { exitCode: 0 }
})
```

## Runtimes and platforms

- Node.js 22 or later (`engines.node`); the tests run on Node 22 and 24 with
  Vitest.
- Linux and macOS are supported: the process scan reads `/proc` on Linux and
  `ps -E` on macOS.
- On Windows the record, the log and the machine id work, and the process scan
  reports that it cannot tell (`null`), so with the default live-id source reconcile never ends a record there
  (reconcile takes the live ids as an input).

## Security

- The process scan reads the environment of the user's own processes and keeps
  only the session and task tags.
- `events.jsonl`, `record.json`, other JSONL files the writer creates, and the
  machine-id cache are created with mode 0600. `record.json` is written
  through a temporary file and a rename.
- The machine id never contains the hardware UUID or the hostname; it is a
  hash.
- `resolveOriginator` records the git user name and the hostname unless its
  `identity` argument is `false`.
- Commands (`ps`, `ioreg`, `reg`, `git`) run with argument arrays and no shell.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).

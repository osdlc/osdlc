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
5. **Secrets are scrubbed before they are written.** Logs of agent work carry
   prompts, tool output and error messages, and those carry tokens and
   passwords. The redactor replaces each secret it finds with
   `[REDACTED:<rule>]` and returns only per-rule counts. It is always on:
   options add rules, never remove them. `appendRedactedJsonl` puts it in front
   of the JSONL writer.
6. **Hook payloads share one envelope.** Each agent harness sends its own JSON
   to a hook. `normalizeHook` reads the harness, event, session id, working
   directory and transcript path out of it, keeps the body as sent, and names
   what was missing, without ever throwing.

It is for launchers and orchestrators that start agent CLIs and other
long-running work, and for the dashboards and reports that read what they
wrote.

## When not to use it

- It does not launch agents, talk to terminals, install hooks, answer hooks
  or read transcripts. Your launcher does those and calls this package through
  small ports.
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
- **secretlint** finds secrets by their shape and is built to lint files. The
  redactor runs its recommended preset as one of four passes, and adds rules for
  what a log line holds that a file seldom does: `Authorization` and cookie
  headers, `key=value` assignments, JSON keys named like secrets, and the values
  of secret-named environment variables.
- **`fast-redact` and pino's `redact` option** blank the values at paths you
  name. They do not look inside a string, so a token in a tool's output gets
  through. Use them for structured fields you know; use the redactor for text.
- **`@osdlc/detect-harness`** finds the harnesses installed on a machine and
  reads their configuration. Its harness ids are the ones the hook envelope
  uses, so a hook event joins a harness report by id.

## Guides

- [Keeping secrets out of logs](./docs/guide/redaction.md): what the redactor
  does to a line, what it catches and misses, and how to wire it into a writer.
- [Reading hook payloads](./docs/guide/hook-payloads.md): one envelope for the
  JSON each agent harness sends to a hook, with examples per harness.

## Install

```sh
npm install @osdlc/observe zod
```

`pnpm add @osdlc/observe` and `yarn add @osdlc/observe` work too.

ESM only. Node.js 22 or later. `zod` 4 is a peer dependency:
the session model takes your own zod schemas, so both must come from one zod.
The runtime dependencies are `@osdlc/command-seam`, which runs `ps`, `ioreg`,
`reg` and `git` without a shell, `@osdlc/etag-write`, which writes the
session record atomically, `@osdlc/tiered-dirs`, which resolves the home
and cache directories the machine-id cache lives under, and
`@secretlint/core` with `@secretlint/secretlint-rule-preset-recommend`, which
the redactor loads on the first text that could hold a secret.

## Entry points

| Import | Holds |
|---|---|
| `@osdlc/observe` | The log envelope, correlation ids and their env tags, sortable ids, the JSONL writer and readers, the machine id and the originator. |
| `@osdlc/observe/session` | The session record: the model over your vocabulary, the state machine, the session env tags, the process scan, hook status, reconcile and the lifecycle runner. |
| `@osdlc/observe/redact` | The redactor, the check for an extra pattern, and the JSONL writer with the redactor in front of it. |
| `@osdlc/observe/hook` | The hook envelope: one shape for a harness's hook payload, and typed readers for its body. Experimental. |

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
  they were created.
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
`SDLC_MACHINE_ID`) from `process.env`. When that is unset, it reads the cache
file `~/.cache/sdlc/machine-id` (under `$XDG_CACHE_HOME` when it is absolute). When the
cache holds no id written on this host (it keeps a hash of the hostname, so
machines that share a home do not share an id), it probes the platform (it runs `ioreg` on macOS or `reg` on
Windows, and reads `/etc/machine-id` on Linux) and writes the cache file. It
computes the id once per process. `sessionEnv`, `isThisMachine` and the reconcile run
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
  A `launched` event may name the `task` the session works on (its basename).
  The record keeps it. It is absent when the session works on no task.
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
  `null` when it could not tell. Also `processScanSupported`, and
  `liveSessionIds`, the default `LiveIds` probe.
- **Hook status.** `runStateForStatus` maps an `AgentStatus` to the state it
  reports.
- **Reconcile.** `decideReconcile` turns `ReconcileEvidence` into a
  `ReconcileDecision` with a `ReconcileVerdict`; `DEFAULT_GRACE_MS`;
  `endedAsLost`; `ReconcilableRecord`. The run over a store is experimental
  (below).

```ts
import {
  decideReconcile,
  DEFAULT_GRACE_MS,
  type ReconcileDecision,
  type ReconcileEvidence,
} from '@osdlc/observe/session'

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

### `@osdlc/observe/redact`

- **Redactor.** `createRedactor(options)` takes `RedactorOptions` and returns a
  `Redactor`, whose `redact` scrubs a string and `redactJson` every string in
  a parsed JSON value, keys included. Both return the per-rule `Redactions`
  and never throw: a pass that fails replaces the whole value with
  `[REDACTED:redactor-error]`. `redact` returns `Redacted`, a branded string
  only the redactor mints, so a field typed `Redacted` refuses a plain string
  at compile time. `mergeRedactions` adds one count into another.
  `RedactionRange` is what the `lint` stand-in returns.
- **Writer.** `appendRedactedJsonl(path, line, redactor)` redacts every field
  of `line` but the envelope's own (`v`, `ts`, `kind`, `writer`, `source`,
  `session`, `run`, `subject`), then appends it as `appendJsonl` does.
- **Patterns.** `redactPatternProblem(regex)` says why an extra pattern would be
  refused: it does not compile, or it has a shape that backtracks
  catastrophically. It loads nothing, so a config loader can call it.

```ts
import { createRedactor } from '@osdlc/observe/redact'

const redactor = createRedactor({ env: { DEPLOY_TOKEN: 'dk-7f3a9c2e11b4' } })

const { text, redactions } = await redactor.redact(
  'curl -H "Authorization: Bearer dk-7f3a9c2e11b4" https://example.com',
)
// text: 'curl -H "Authorization: Bearer [REDACTED:auth-scheme]" https://example.com'
// redactions: { 'auth-scheme': 1 }
```

```ts
import { appendRedactedJsonl, createRedactor } from '@osdlc/observe/redact'

const redactor = createRedactor()

const redactions = await appendRedactedJsonl(
  join(store, 'tools.jsonl'),
  {
    v: 1,
    ts: new Date().toISOString(),
    kind: 'tool.output',
    source: 'hook',
    session: 's-01JABCDEFGHJKMNPQRSTVWXYZ0',
    output: 'connecting to postgres://app:s3cr3t-pa55@db.internal/prod',
  },
  redactor,
)
// The envelope's keys are kept; `output` becomes
// 'connecting to [REDACTED:database-connection-string]'.
```

What it finds: secretlint's recommended preset (cloud, chat, package-registry
and payment provider keys, private keys, connection strings, basic auth),
PEM and PGP private keys, JWTs, provider API keys, URL passwords, `Authorization`
and cookie headers, bearer tokens, a value assigned to a secret-named key
(`DB_PASSWORD=...`, `"api_key": "..."`), a long high-entropy token after a
key-like word, and the value of every environment variable whose name has a
secret-like part (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `AUTH`...) and is 8
characters or longer. `envNames` adds variables by name and `extraPatterns`
adds regexes, reported as `custom:<id>`. `redactJson` also blanks the value of
a secret-named key whatever it holds, except a number under a key that names
a token, which is a count: `"max_tokens": 100` stays. A value with a `toJSON`
method (a `URL`, a `Buffer`) is replaced by what that returns, then redacted,
and an `Error` keeps its own fields and `cause`.

What it misses: a secret with no shape or context (a bare 40-character AWS
secret key with no key name or access key id nearby looks like any other
base64), and a secret split across a line wrap.

### `@osdlc/observe/hook`

- **Envelope.** `normalizeHook(harness, payload)` and
  `normalizeHookText(harness, text)` return a `HookEnvelope`
  (`HookEnvelopeSchema`): the `HookHarness`, the `event`, `sessionId`, `cwd`,
  `transcriptPath`, the optional `promptId`, the payload as sent in `raw`, and
  `missing`, the `HookEnvelopeField`s it lacked. `HOOK_HARNESSES` and
  `HOOK_ENVELOPE_FIELDS` list the values.
- **Body readers.** `rawString`, `rawNumber` and `rawValue` read a field of the
  body, and `isPermissionNotification` says whether a `Notification` event's
  type means the agent waits on a person.

The payload must be in the shape Claude Code and Codex send
(`hook_event_name`, `session_id`, `cwd`, `transcript_path`). Cursor's must be
re-keyed first, and pi and opencode have no hooks: an extension or plugin
forwards their events in Claude Code's vocabulary.

```ts
import {
  normalizeHookText,
  rawNumber,
  rawString,
  rawValue,
  type HookEnvelope,
} from '@osdlc/observe/hook'

const envelope: HookEnvelope = normalizeHookText('codex', stdin)
// envelope.event: 'PostToolUse', envelope.promptId: 'turn-7'
// envelope.missing: ['transcript_path']

const tool = rawString(envelope, 'tool_name') // 'Bash'
const ms = rawNumber(envelope, 'duration_ms') // 812
const input = rawValue(envelope, 'tool_input') // { command: 'npm test' }
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
  `LogSource`, `AgentStatus`, `HookHarness` and `HookEnvelopeField` are closed
  unions: a new value is a breaking change (a minor version while 0.x).
- **Redaction markers.** A redacted span reads `[REDACTED:<rule>]`. The rule ids
  are the secretlint rule names without their `@secretlint/secretlint-rule-`
  prefix, the built-in rule names, `env:<NAME>`, `custom:<id>` and
  `redactor-error`.

## Stability

The package is 0.x: a breaking change is a minor version. Everything is
stable for 0.x except the items below, which may change in any minor release.

The experimental exports:

`reconcileSessions`, `ReconcileDeps`, `ReconcileRow`, `ReconcileReport`,
`BACKFILL_STATUSES`, `BackfillStatus`, `runHeadlessSession`,
`runInteractiveSession`, `endSession`, `resolveRun`, `resolveLineage`,
`LifecycleEvent`, `LifecyclePorts`, `HostOpened`, `InteractiveRun`,
`InteractiveResult`, `RunContext`, and the hook entry: `HOOK_HARNESSES`,
`HookHarness`, `HOOK_ENVELOPE_FIELDS`, `HookEnvelopeField`,
`HookEnvelopeSchema`, `HookEnvelope`, `normalizeHook`, `normalizeHookText`,
`isPermissionNotification`, `rawString`, `rawNumber` and `rawValue`.

The hook entry is experimental while the set of events it normalises beyond
the envelope is undecided. The redact entry is stable.

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

- Node.js 22 or later (`engines.node`). The tests run on Node 22 and 24 with
  Vitest.
- Linux and macOS are supported: the process scan reads `/proc` on Linux and
  `ps -E` on macOS.
- On Windows the record, the log and the machine id work, and the process scan
  reports that it cannot tell (`null`). Reconcile takes the live ids as an
  input, so with the default live-id source it never ends a record there.

## Security

- The process scan reads the environment of the user's own processes and keeps
  only the session and task tags.
- `events.jsonl`, `record.json`, other JSONL files the writer creates, and the
  machine-id cache are created with mode 0600. `record.json` is written
  through a temporary file and a rename.
- The machine id never contains the hardware UUID or the hostname. It is a
  hash.
- `resolveOriginator` records the git user name and the hostname unless its
  `identity` argument is `false`.
- Commands (`ps`, `ioreg`, `reg`, `git`) run with argument arrays and no shell.
- The redactor never returns or logs what it matched, only counts. It fails
  closed: if secretlint cannot load or a pass throws, the whole value is
  replaced. Every built-in regex is bounded, so a hostile 100 KiB input does not
  stall a writer. An `extraPatterns` regex is checked for the common
  catastrophic shapes when the redactor is built, but it is yours and runs
  unbounded. Redaction lowers the chance a secret reaches a log; it is not a
  guarantee, so keep logs as private as their sources.
- `normalizeHook` keeps the payload in `raw` as the harness sent it, so redact
  it before you log it.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).

# @osdlc/agent-call

One call spec for headless coding-agent CLIs.

You describe a call once: the prompt, the permission posture, the context, the
output shape and the session. Each adapter turns that into a command line for
`claude`, `codex`, `agy`, `opencode`, `copilot`, `pi`, `qwen`, `droid`,
`agent` (Cursor) or `dsh` on a best-effort basis and records every
approximation. The result comes back normalized (final text, structured
output, session id, token usage, cost) with the raw output kept. On request,
the whole transcript is also converted into one conversation model for
analysis afterwards. One dependency, `@osdlc/command-seam`, for its `PATH`
lookup.

## Why

Every program that runs an agent CLI grows its own argument builder, output
parser, permission flags and timeout code. The CLIs disagree on how a prompt
travels, what "auto-approve edits" is called, and whether structured output is
a flag at all. This package is that code, written once, with the differences
listed in the capability map below.

It is for tools that run a coding agent once and read the answer: scripts,
CI steps, evaluation harnesses, review and triage bots, and orchestrators that
dispatch work to whichever agent is installed.

When not to use it:

- For a conversation. A call is one prompt and one answer. It can resume a
  session by id, but it holds no session open.
- For a run you want to steer. A call takes no input once it starts. You can
  watch it: the `onOutput` option hands you the output as it arrives, but the
  result, parsed events included, comes after the run.
- For an agent that has no one-shot CLI mode.
- For an exact, identical result on every agent. Where a CLI cannot express a
  field, the adapter approximates it, folds it into the prompt, or drops it,
  and says so in `notes`.
- To call a model API. This package starts agent CLIs as processes.

## How it compares

- **acpx** is a session client. It drives agents through Agent Client Protocol
  adapters such as `@agentclientprotocol/claude-agent-acp`, not through the
  CLIs, keeps its sessions under `~/.acpx`, and has runtime dependencies.
  agent-call is a one-shot call over the CLIs themselves, with one small
  dependency and no state on disk. Pick acpx for multi-turn sessions,
  queues, flows, or an agent that speaks only ACP.
- **The Agent Client Protocol** (ACP) is a protocol between a client, such as
  an editor, and an agent. `@agentclientprotocol/sdk` is its library.
  agent-call does not speak ACP. Its conversation model follows the common
  core of ACP session updates, so a stored conversation maps onto them.
- **The vendor SDKs**, `@anthropic-ai/claude-agent-sdk` and
  `@openai/codex-sdk`, each drive one vendor's agent from code. Pick one when
  you target that agent only and need what it offers beyond a one-shot call.
  Pick agent-call when the same call has to run on more than one agent.
- **coder/agentapi** runs agents behind an HTTP service with terminal
  emulation. agent-call is a library with no server.
- **The Vercel AI SDK** abstracts model APIs. agent-call drives agent CLIs as
  processes.

## Install

```sh
npm install @osdlc/agent-call
```

`pnpm add @osdlc/agent-call` and `yarn add @osdlc/agent-call` work too.

ESM only. Node.js 22 or later.

The agent CLIs are not installed by this package. Install the ones you call
(`claude`, `codex`, `agy`, `opencode`, `copilot`, `pi`, `qwen`, `droid`,
`agent` for Cursor, `dsh`)
and sign in to each.

## Quick start

Plan a call without running it. `planned.argv` is the exact command line, and
`planned.notes` says what was approximated:

```ts
import {
  adapterFor,
  callAgent,
  customAdapter,
  planCall,
  templateAdapter,
  type AgentCallSpec,
} from '@osdlc/agent-call'

const spec: AgentCallSpec = {
  prompt: 'Summarize the failing tests and propose a fix.',
  permissions: { mode: 'read-only' },
  context: { files: ['src/runner.ts'] },
  timeoutMs: 120_000,
}

// planned.argv is the exact command line; planned.notes says what was approximated.
const planned = planCall(adapterFor('codex'), spec)
```

To run a built-in agent, pass its adapter to `callAgent`:
`callAgent(adapterFor('claude'), spec)`. Swap `'claude'` for any name in
`BUILTIN_AGENTS` (`'codex'`, `'antigravity'`, `'opencode'`, `'copilot'`,
`'pi'`, `'qwen'`, `'droid'`, `'cursor'` or `'deepseek'`) and the same spec
runs there. `callAgent` resolves to an `AgentResult`: `ok`, `text`,
`structured`, `sessionId`, `usage`, `costUsd`, `exitCode`, `durationMs`, the
`planned` call that ran, and the `raw` output.

Each built-in adapter takes a `binary` option, or a `command` for an agent
that runs through a launcher or needs arguments before its own, such as
`npx -y @anthropic-ai/claude-code` or `codex --profile work`. `command`
replaces `binary` when it has at least one element:

```ts
const codex = codexAdapter({ command: ['codex', '--profile', 'work'] })
const planned = planCall(codex, { prompt: 'Review the change.' })
// planned.argv is ['codex', '--profile', 'work', 'exec', ...]
```

`detectAgents` runs the whole command with `--version` appended, and each
result's `command` says what answered. The Cursor CLI installs as both
`agent`, the default cursor adapter's binary, and `cursor-agent`. `agent` is a
generic name, so `detectAgents` counts it as Cursor only when it prints a
date-stamped version such as `2026.10.01-abc123`, and otherwise tries
`cursor-agent`:

```ts
const [cursor] = await detectAgents([cursorAdapter()])
// cursor.command is ['agent'] or ['cursor-agent'] when available, else undefined.
const adapter = cursorAdapter({ command: cursor?.command })
```

Any one-shot CLI runs through `customAdapter`. This one needs only `node`:

```ts
const shout = customAdapter({
  name: 'shout',
  binary: 'node',
  args: (_spec, prompt) => ['-e', 'console.log(process.argv[1].toUpperCase())', prompt],
})

const result = await callAgent(shout, { prompt: 'hello' })
// result.ok is true and result.text is 'HELLO'
```

`customAdapter` takes the same `command` option as the built-in adapters.
`args` builds what follows it, and `binary` (which defaults to `name`) is
then its first element:

```ts
const viaNpx = customAdapter({
  name: 'my-cli',
  command: ['npx', '-y', 'my-cli'],
  args: (_spec, prompt) => ['--message', prompt],
})
// planCall(viaNpx, spec).argv starts ['npx', '-y', 'my-cli', '--message', ...]
```

A CLI with an argument template, such as Aider, fits `templateAdapter`
(experimental). Aider and Crush print no machine-readable output, so they have
no built-in adapter:

```ts
const aider = templateAdapter({
  name: 'aider',
  binary: 'aider',
  args: ['--message', '{prompt}', '--model', '{model}', '--yes-always', '--no-auto-commits'],
  promptVia: 'argv',
})
```

Every example in this README is in `examples/`, which runs as part of the test
suite.

### Watching a run

Output is collected and returned after the run. To show it while a person
waits, pass `onOutput`: it gets each chunk of decoded text as it arrives,
tagged `stdout` or `stderr`, and the output is still collected and parsed.

```ts
const result = await callAgent(adapter, spec, {
  onOutput: (chunk, stream) => (stream === 'stdout' ? process.stdout : process.stderr).write(chunk),
})
```

A throw from `onOutput` is swallowed and stops later calls. The run carries
on. Nothing is delivered past `maxOutputBytes`.

### Capping output

`maxOutputBytes` on the spec keeps a runaway agent from filling the host's
memory before `timeoutMs` fires. It caps stdout and stderr separately, in
bytes the agent wrote. When a stream passes the cap, the run is stopped the way
a timeout stops it (SIGTERM, then SIGKILL after 5 s) and `callAgent` resolves
`ok: false` with the reason `output-limit`. The output read so far stays in
`raw`, cut to the cap on a character boundary, and `raw.outputLimit` names the
stream. `Infinity` means no cap.

`@osdlc/command-seam` has the same option on its capture runners, with the
reason `output` and an immediate SIGKILL. Each package matches its own timeout
handling.

### Failures

`callAgent` does not throw when the agent fails. It resolves with `ok: false`
and an `error`: `{ reason, detail }`. The reasons today are `spawn-failed`,
`timeout`, `nonzero-exit`, `agent-error` and `output-limit`.
**The set of reasons is open.** A minor release may add one, so handle the
reasons you know and keep a default branch.

It rejects with a `RangeError` when `maxOutputBytes` is `0`, negative or `NaN`,
and a `TypeError` when it is not a number. A fraction rounds up. It also
rejects, with an `Error`, when planning throws: `templateAdapter` throws for a
model or effort that does not fit its template, and `customAdapter` passes on
whatever your `args` function throws. It also rejects when a plan's
`TempFile.name` is not a plain file name (empty, or holding `/`, `\` or `..`),
or when the temp directory for the plan's temp files cannot be created or
written.
A parser that throws on the output does not reject: the result is `ok: false`
with reason `agent-error`. `planCall` throws the same way as planning. The
`callAgent` TSDoc is the full list.

## API

Everything is exported from `@osdlc/agent-call`. `@osdlc/agent-call/models`
exports `EFFORT_LEVELS` and `EffortLevel` with no Node imports, so a browser
bundle can use them.

The package is 0.x. The stable exports follow semantic versioning for 0.x: a
breaking change goes in a minor release and is marked `Breaking` in the
changelog. The experimental exports may change in any minor release.

The stable exports:

- The call spec: `AgentCallSpec`, `AgentName`, `PermissionSpec`,
  `PermissionMode`, `ContextSpec`, `OutputSpec`, `OutputFormat`, `SessionSpec`,
  `McpSpec`, `PluginSpec`, and `EFFORT_LEVELS` with `EffortLevel`.
- Planning and running: `planCall`, `callAgent`, `PlannedCall`,
  `CapabilityNote`, `Support`, `TempFile`, `TMP_TOKEN`, `AgentResult`,
  `CallError` and `CallOptions`.
- Built-in adapters: `adapterFor`, `BUILTIN_AGENTS`, `detectAgents`,
  `AgentAvailability`, `claudeAdapter`, `codexAdapter`, `antigravityAdapter`,
  `opencodeAdapter`, `copilotAdapter`, `piAdapter`, `qwenAdapter`,
  `droidAdapter`, `cursorAdapter`, `deepseekAdapter`, and their options types
  `ClaudeAdapterOptions`, `CodexAdapterOptions`, `AntigravityAdapterOptions`,
  `OpencodeAdapterOptions`, `CopilotAdapterOptions`, `PiAdapterOptions`,
  `QwenAdapterOptions`, `DroidAdapterOptions`, `CursorAdapterOptions` and
  `DeepseekAdapterOptions`.
- Your own adapters: `customAdapter`, `CustomAdapterOptions`, `AgentAdapter`,
  `ParsedOutput` and `RawProcessOutput`.
- The conversation model: `Conversation`, `ConversationMessage`, `Part`,
  `Role`, `Usage`, `CONVERSATION_SCHEMA`, `assistantText` and `toolCalls`.

The experimental exports:

`modelArgs`, `modelArgsRefusal`, `ModelChoice`, `templateAdapter`,
`templateRefusal`, `TemplateAdapterOptions`, `claudePluginArgv` and
`claudeResumeFlag`.

These build launch arguments for callers that assemble a command line
themselves: model and effort flags for claude, codex and pi, an argument
template for any CLI, claude's plugin flags and its `--resume=<id>` flag. They
work and are tested, but their shape is not settled.

`BUILTIN_AGENTS` and `EFFORT_LEVELS` are frozen at run time and typed
`readonly`.

Each export has TSDoc, including `@throws` where it can throw. Your editor
shows it.

## Design

- **Spec** (`AgentCallSpec`) is one call in agent-agnostic terms. Only
  `prompt` is required.
- **Plan** (`planCall(adapter, spec)`) is a pure translation: spec in,
  `PlannedCall` out (argv, stdin, env, temp files, capability notes). It has no
  side effects, so you can inspect it or golden-test it before running
  anything.
- **Run** (`callAgent(adapter, spec)`) spawns the planned call, applies the
  library-level timeout (no agent CLI has one), and returns an `AgentResult`.
- **Conversation** (optional): `callAgent(adapter, spec, { captureConversation:
  true })` converts the transcript into `agent-conversation/1`: role-tagged
  messages of typed parts (`text`, `reasoning`, `tool-call`, `tool-result`)
  with usage, cost, duration and stop reason. The untouched transcript stays in
  `raw`. The shape follows the common core of ACP session updates, OpenTelemetry
  GenAI attributes and the Vercel AI SDK message model.

```ts
const result = await callAgent(adapter, spec, { captureConversation: true })
const conversation = result.conversation!
const answer = assistantText(conversation)
const calls = toolCalls(conversation)
```

`assistantText` joins the assistant's text. `toolCalls` lists every tool call
in order. `JSON.stringify(conversation)` is stable, so you can store it.

### Best-effort translation, reported

Every planned call carries `notes: CapabilityNote[]`, one entry per spec field
that did not map one to one:

- `native`: the CLI has a flag for it.
- `approximated`: mapped to the closest available behaviour.
- `emulated`: reproduced in the prompt or through the environment.
- `dropped`: the CLI cannot express it. The field is ignored and the note says
  why.

### Capability map

| Spec field | claude | codex | antigravity | opencode |
|---|---|---|---|---|
| `prompt` | stdin | stdin (`-`) | `-p <prompt>` | positional |
| `model` | `--model` | `--model` | `--model` | `--model` (provider/model) |
| `effort` (`none` to `max`, least to most reasoning) | `--effort` (`none`, `minimal` → `low`) | `model_reasoning_effort` | `--effort` (`none`, `minimal` → `low`; `xhigh`, `max` → `high`) | `--variant` |
| `systemPrompt` | `--system-prompt` | prompt-emulated | prompt-emulated | prompt-emulated |
| `appendSystemPrompt` | `--append-system-prompt` | prompt-emulated | prompt-emulated | prompt-emulated |
| `permissions.mode: read-only` | `--permission-mode plan` (approximated) | `--sandbox read-only` | `--sandbox` (approximated) | `OPENCODE_PERMISSION` deny map |
| `permissions.mode: edits` | `--permission-mode acceptEdits` | `--sandbox workspace-write` | dropped | `OPENCODE_PERMISSION` |
| `permissions.mode: full-auto` | acceptEdits + allowed Bash/Web (approximated) | `--sandbox workspace-write` | `--dangerously-skip-permissions` | `OPENCODE_PERMISSION` allow map |
| `permissions.mode: bypass` | `--dangerously-skip-permissions` | `--dangerously-bypass-approvals-and-sandbox` | `--dangerously-skip-permissions` | `OPENCODE_PERMISSION` allow map |
| `permissions.allowTools` | `--allowedTools` | dropped | dropped | dropped |
| `permissions.denyTools` | `--disallowedTools` | dropped | dropped | dropped |
| `context.files` | prompt preamble | prompt preamble | `@path` in prompt | `--file` |
| `context.dirs` | `--add-dir` | `--add-dir` | dropped | dropped |
| `context.text` | prompt preamble | prompt preamble | prompt preamble | prompt preamble |
| `output.format` | `text\|json\|stream-json` | `--json` events | `text\|json\|stream-json` | `--format json` events |
| `output.schema` | `--json-schema` | `--output-schema` file | `--json-schema` | prompt-emulated |
| `session.resume` | `--resume=<id>` | `exec resume <id>` | `--conversation <id>` | `--session` |
| `session.continueLast` | `--continue` | `exec resume --last` | `--continue` | `--continue` |
| `session.id` | `--session-id` | dropped | dropped | dropped |
| `session.persist: false` | `--no-session-persistence` | `--ephemeral` | dropped | dropped |
| `mcp.servers` | `--mcp-config` | `-c mcp_servers.*` | dropped | dropped |
| `budgetUsd` | `--max-budget-usd` | dropped | dropped | dropped |
| `timeoutMs` | library-level (SIGTERM → SIGKILL) on all agents | | | |
| `maxOutputBytes` | library-level per-stream cap (SIGTERM → SIGKILL, reason `output-limit`) on all agents | | | |
| `extraArgs` | appended verbatim on all agents | | | |

The same rows for the other six agents:

| Spec field | copilot | pi | qwen | droid | cursor | deepseek |
|---|---|---|---|---| --- |---|
| `prompt` | stdin | stdin | stdin | stdin | stdin | stdin (`-`) |
| `model` | `--model` | `--model` (provider/model) | `--model` | `--model` (`custom:<id>` for BYOK) | `--model` | `--patch` model row (approximated) |
| `effort` (`none` to `max`, least to most reasoning) | `--reasoning-effort` | `--thinking` (`none` → `off`) | `QWEN_CODE_SYSTEM_DEFAULTS_PATH` file (approximated; `none`, `minimal` → `low`) | `--reasoning-effort` (`none`, `minimal` → `low`) | dropped (some model slugs take `[effort=…]`) | `--patch` model row (approximated; `none` → `off`, `minimal` → `low`, `medium` → `high`, `xhigh` → `max`) |
| `systemPrompt` | prompt-emulated | `--system-prompt` (temp file) | `--system-prompt` | prompt-emulated | prompt-emulated | `--patch` persona prefix (approximated) |
| `appendSystemPrompt` | `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` file (approximated) | `--append-system-prompt` (temp file) | `--append-system-prompt` | `--append-system-prompt-file` (temp file) | prompt-emulated | `--patch` persona suffix |
| `permissions.mode: read-only` | `--deny-tool=write` (approximated) | `--tools read,grep,find,ls` (approximated) | `--approval-mode plan` (approximated) | no flag (`droid exec` is read-only) | `--mode ask` (approximated) | `DSH_PERMISSION_MODE` `read-only` |
| `permissions.mode: edits` | `--allow-tool=write` | `--tools read,grep,find,ls,edit,write` (approximated) | `--approval-mode auto-edit` | `--auto low` (approximated) | no flag (print mode applies edits, rejects commands) | `DSH_PERMISSION_MODE` `workspace-write` (approximated) |
| `permissions.mode: full-auto` | `--allow-all-tools` (approximated) | `--tools` all built-ins (approximated) | auto-edit + allowed shell and web fetch (approximated) | `--auto medium` (approximated) | `--sandbox enabled` | `DSH_PERMISSION_MODE` `workspace-write` |
| `permissions.mode: bypass` | `--allow-all` | `--tools` all built-ins | `--approval-mode yolo` | `--skip-permissions-unsafe` | `--force --sandbox disabled` | `DSH_PERMISSION_MODE` `danger-full-access` |
| `permissions.allowTools` | `--allow-tool` | `--tools` (approximated) | `--allowed-tools` | `--add-tools` (approximated) | dropped | dropped |
| `permissions.denyTools` | `--deny-tool` | `--exclude-tools` | `--exclude-tools` | `--remove-tools` (approximated) | dropped | dropped |
| `context.files` | prompt preamble | `@path` arguments | `@path` in prompt | prompt preamble | prompt preamble | prompt preamble |
| `context.dirs` | `--add-dir` | dropped | `--include-directories` | dropped | `--add-dir` | dropped |
| `context.text` | prompt preamble | prompt preamble | prompt preamble | prompt preamble | prompt preamble | prompt preamble |
| `output.format` | `--output-format json` events; text is `-s` | `--mode json` events; text is `-p` | `text\|json\|stream-json` | `text\|json\|stream-json` | `text\|json\|stream-json` | `--json` events |
| `output.schema` | prompt-emulated | prompt-emulated | `--json-schema` | prompt-emulated | prompt-emulated | prompt-emulated |
| `session.resume` | `--resume=<id>` | `--session` | `--resume=<id>` | `--session-id` | `--resume=<id>` | `--session-id` (same cwd only) |
| `session.continueLast` | `--continue` | `--continue` | `--continue` | dropped | `--continue` | dropped |
| `session.id` | `--session-id` (UUID) | `--session-id` | `--session-id` (UUID) | `--session-id` (approximated) | `--new-session-id` (UUID; approximated) | dropped |
| `session.persist: false` | dropped | `--no-session` | `--chat-recording false` (approximated) | dropped | dropped | dropped |
| `mcp.servers` | `--additional-mcp-config` | dropped | `--mcp-config` | dropped | `--plugin-dir` temp plugin (approximated) | `--patch` mcp-client rows (approximated) |
| `budgetUsd` | dropped | dropped | dropped | dropped | dropped | dropped |
| `timeoutMs` | library-level (SIGTERM → SIGKILL) on all agents | | | | | |
| `maxOutputBytes` | library-level per-stream cap (SIGTERM → SIGKILL, reason `output-limit`) on all agents | | | | | |
| `extraArgs` | appended verbatim on all agents | | | | | |

`deepseek` is the DeepSeek Harness (`dsh --profile headless`). It has no flags
for model, effort or system prompts, so the adapter writes a profile overlay to
a temp file and passes it with `--patch`. To run DeepSeek models in another
agent instead, give that agent a DeepSeek model: `deepseek/<model>` on opencode
and pi, or `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` in `env` for
claude.

`tests/contract.test.ts` plans one spec per row on each adapter and checks the
support level of each cell against the notes.

When no `output.format` is given, adapters default to their richest aggregate
format (a JSON envelope or an event stream), so metadata is captured.
`result.text` carries the final answer either way.

## Runtimes and platforms

- **Runtimes:** Node.js 22 or later. ESM only. Another runtime is not claimed
  until a test runs on it.
- **Platforms:** Linux and macOS are supported. Windows is untested. A
  timeout or abort kills the agent's whole process group, which needs POSIX
  process groups. On Windows the group kill fails and the call falls back to
  killing the direct child, so a grandchild process can outlive a timeout.
- **Interrupts:** the agent runs in its own process group, so Ctrl+C or a kill
  of the host does not reach it. The package installs no exit handlers. A host
  that can be interrupted must pass a `signal` to `callAgent` and abort it from
  its own SIGINT/SIGTERM handler, or the agent keeps running.

## Security

- A bare binary name (`claude`, `codex`, ...) is looked up on the absolute
  entries of the child's `PATH` only, and the absolute path found is spawned.
  A relative or empty entry (`.`, `bin`, `a::b`) is skipped, so an agent
  binary planted in the working directory, such as a pull request's
  checkout, is never the one run. Not found is `spawn-failed`. A binary given
  as a path (`/opt/claude/bin/claude`, `./claude`) is run as given.
- The child process inherits the parent's whole environment, plus the spec's
  `env`. Credentials in your environment reach the agent CLI. Pass a trimmed
  environment to the parent if that matters.
- Any local user can read argv in the process list. The prompt travels in
  argv for antigravity (`-p <prompt>`) and opencode (positional), so do not
  put secrets in a prompt for those two agents. claude and codex read the
  prompt from stdin. claude reads MCP server config, including `env` values,
  from a temp file. codex has no config-file option, so its MCP servers,
  including `env` values, go on the command line as `-c mcp_servers.*`
  overrides. claude's `systemPrompt` and `appendSystemPrompt` are also argv.
  copilot, pi, qwen, droid, cursor and deepseek read the prompt from stdin.
  qwen's system prompts are argv. copilot, qwen,
  cursor and deepseek read MCP config from a temp file.
- Not every posture is a sandbox. pi never asks before a tool call and has no
  sandbox: its modes only choose which tools are enabled, and MCP tools stay
  enabled unless denied. droid's `--auto` levels and copilot's tool rules
  allow or block commands by risk, not by an OS sandbox.
- pi with no `model` picks whichever provider has credentials in the
  environment, cloud credentials such as AWS included. Pass `model`, or a
  trimmed environment.
- Most of the agents keep sessions on disk whatever the spec says: copilot
  under `~/.copilot`, droid under `~/.factory`, qwen under `~/.qwen`, pi under
  `~/.pi/agent` unless `session.persist` is false, cursor under `~/.cursor`
  (and its auth token in `~/.config/cursor`), and deepseek under
  `$DSH_HOME` (default `~/.dsh`).
- The DeepSeek Harness sends the session log so far and an anonymous install
  id with each model request, and asks the model for a session title. Set
  `DSH_TELEMETRY_DISABLED=1` in `env` to turn off its feedback telemetry.
- `permissions.mode: 'bypass'` skips all approvals and sandboxing
  (`--dangerously-skip-permissions` and its equivalents). Use it only in an
  environment that is sandboxed from outside.
- The runner starts the binary with an argument array and no shell.
- A resumed deepseek session keeps the permission it was created with, so
  `permissions.mode` is dropped (and noted) when `session.resume` is set.
- cursor refuses a headless run in a workspace it does not trust.
  `cursorAdapter({ trustWorkspace: true })` passes `--trust`, which marks the
  working directory and each `context.dirs` entry trusted under
  `~/.cursor/projects/` for good, interactive sessions included. Do not use it
  on a checkout you would not open in Cursor yourself.
- cursor's default binary is `agent`, and deepseek's is `dsh`. Both names are
  generic. `detectAgents` counts `agent` as Cursor only when it prints a
  date-stamped version, but for `dsh` it only checks that `dsh --version`
  exits 0, so an unrelated program with that name reads as installed. Pass
  `binary` with a full path to be sure.

## Development

The tests run on [Vitest](https://vitest.dev) under Node. From the package
directory, `pnpm test` runs the unit tests. Parsers are tested against
fixtures and the runner against real processes. `pnpm run typecheck` and
`pnpm run build` (tsc to `dist/`) check the types and the emit. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

The live smoke tests make real, cheap agent calls against whichever CLIs are
installed: `pnpm run test:live`. They are skipped unless `AGENT_CALL_LIVE=1`
is set, which that script does.

Verified against: claude 2.x, codex and opencode 1.x (live). The
antigravity mappings are built from the CLI's documentation and tested against
fixtures only. The live suite has no antigravity case.

copilot 1.0.98, pi 1.3.0, qwen 0.25.2, droid 0.244.0 and dsh 0.2.0-rc.2 were
checked against their `--help` and source. Their fixtures come from real runs
against a local fake model server through each CLI's custom-provider setting,
not a vendor's model. dsh is a developer preview and may change in any
release. cursor (`agent` 2026.08.11) was checked against its bundled source
and run against a fake Cursor backend, since its backend speaks Cursor's own
protocol rather than a model API. Cursor's real backend enforces read-only
mode. The tests use a fake backend, so that was not tested. The live suite
has a case for each of these six.

## Non-goals

- Orchestration (worktrees, queues, parallelism). This package makes the
  single call that such tools build on.
- A trace backend. `agent-conversation/1` is meant to be stored or exported.
  Store it where you choose.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).

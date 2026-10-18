# @osdlc/agent-call

One call spec for headless coding-agent CLIs.

You describe a call once: the prompt, the permission posture, the context, the
output shape and the session. Each adapter turns that into a `claude -p`,
`codex exec`, `agy -p` or `opencode run` command line on a best-effort basis
and records every approximation. The result comes back normalized (final text,
structured output, session id, token usage, cost) with the raw output kept. An
optional layer lifts the whole transcript into one conversation model for
analysis afterwards. No dependencies.

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
- For a run you want to steer or watch live. Output is collected, not
  streamed to your code as it arrives (`stream-json` returns the events after
  the run).
- For an agent that has no one-shot CLI mode.
- For an exact, identical result on every agent. Where a CLI cannot express a
  field, the adapter approximates it, folds it into the prompt, or drops it,
  and says so in `notes`.
- To call a model API. This package starts agent CLIs as processes.

## How it compares

- **acpx** is a session client. It drives agents through Agent Client Protocol
  adapters such as `@agentclientprotocol/claude-agent-acp`, not through the
  CLIs, keeps its sessions under `~/.acpx`, and has runtime dependencies.
  agent-call is a one-shot call over the CLIs themselves, with no
  dependencies and no state on disk. Pick acpx for multi-turn sessions,
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

ESM only. Node.js 22 or later.

The agent CLIs are not installed by this package. Install the ones you call
(`claude`, `codex`, `agy`, `opencode`) and sign in to each.

## Quick start

Plan a call without running it. `planned.argv` is the exact command line, and
`planned.notes` says what was approximated:

```ts
import { adapterFor, callAgent, customAdapter, planCall, type AgentCallSpec } from '@osdlc/agent-call'

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
`callAgent(adapterFor('claude'), spec)`. Swap `'claude'` for `'codex'`,
`'antigravity'` or `'opencode'` and the same spec runs there. `callAgent`
resolves to an `AgentResult`: `ok`, `text`, `structured`, `sessionId`, `usage`,
`costUsd`, `exitCode`, `durationMs`, the `planned` call that ran, and the `raw`
output.

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

Every example in this README is in `examples/`, which runs as part of the test
suite.

### Failures

`callAgent` does not throw when the agent fails. It resolves with `ok: false`
and an `error`: `{ reason, detail }`. The reasons today are `spawn-failed`,
`timeout`, `nonzero-exit` and `agent-error`. **The set of reasons is open.** A
minor release may add one, so handle the reasons you know and keep a default
branch.

It does reject, with an `Error`, in three cases. Planning can throw:
`templateAdapter` throws for a model, effort or prompt that does not fit its
template (see its TSDoc), and `customAdapter` passes on whatever your `args`
function throws. A plan's `TempFile.name` can be not a plain file name (empty,
or holding `/`, `\` or `..`). Or the temp directory for the plan's temp files
cannot be created or written.
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
  `opencodeAdapter`, and their options types `ClaudeAdapterOptions`,
  `CodexAdapterOptions`, `AntigravityAdapterOptions` and
  `OpencodeAdapterOptions`.
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
  true })` lifts the transcript into `agent-conversation/1`: role-tagged
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
in order. `JSON.stringify(conversation)` is stable: store it.

### Best-effort translation, reported

Every planned call carries `notes: CapabilityNote[]`, one entry per spec field
that did not map one to one:

- `native`: the CLI has a first-class flag.
- `approximated`: mapped to the closest available behaviour.
- `emulated`: reproduced in the prompt or through the environment.
- `dropped`: the CLI cannot express it. The field is ignored and the note says
  why.

### Capability map

| Spec field | claude | codex | antigravity | opencode |
|---|---|---|---|---|
| `prompt` | stdin | stdin (`-`) | `-p <prompt>` | positional |
| `model` | `--model` | `--model` | `--model` | `--model` (provider/model) |
| `effort` (`low` to `max`, `xhigh` included) | `--effort` | `model_reasoning_effort` | `--effort` (`xhigh`, `max` → `high`) | `--variant` |
| `systemPrompt` | `--system-prompt` | prompt-emulated | prompt-emulated | prompt-emulated |
| `appendSystemPrompt` | `--append-system-prompt` | prompt-emulated | prompt-emulated | prompt-emulated |
| `permissions.mode: read-only` | `--permission-mode plan` | `--sandbox read-only` | `--sandbox` (approximated) | `OPENCODE_PERMISSION` deny map |
| `permissions.mode: edits` | `--permission-mode acceptEdits` | `--sandbox workspace-write` | dropped | `OPENCODE_PERMISSION` |
| `permissions.mode: full-auto` | acceptEdits + allowed Bash/Web | `--sandbox workspace-write` | `--dangerously-skip-permissions` | `OPENCODE_PERMISSION` allow map |
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
| `extraArgs` | appended verbatim on all agents | | | |

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
- `permissions.mode: 'bypass'` skips all approvals and sandboxing
  (`--dangerously-skip-permissions` and its equivalents). Use it only in an
  environment that is sandboxed from outside.
- The runner starts the binary with an argument array and no shell.

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

## Non-goals

- Orchestration (worktrees, queues, parallelism). This is the invocation
  primitive such tools build on.
- A trace backend. `agent-conversation/1` is meant to be stored or exported;
  bring your own sink.

# Changelog

## 0.5.0

### Minor Changes

- 778129e: The built-in adapters take a `command` option: the command to run as argv, for an agent that runs through a launcher or needs arguments before the adapter's own, such as `['npx', '-y', '@anthropic-ai/claude-code']` or `['codex', '--profile', 'work']`. It replaces `binary` when it has at least one element, and an empty array is ignored. `planned.argv` starts with it, `adapterFor` passes it through, and `detectAgents` runs it with `--version` appended. `AgentAdapter` gains an optional `command` field, which the built-in adapters always set; `binary` is its first element.
  
  - **Breaking:** `detectAgents` probes `command` when it is set, so an adapter copied with only a new `binary` (`{ ...claudeAdapter(), binary: '/opt/claude' }`) now probes the original command, where before it probed the copy's `binary`. Pass `binary` or `command` to the factory instead.
- 778129e: Add `maxOutputBytes` to `AgentCallSpec`: a cap on the bytes read from each output stream, stdout and stderr. It counts the bytes the agent wrote, so output that is not valid UTF-8 can decode to a longer string. A stream that passes it stops the agent's process group as a timeout does (SIGTERM, then SIGKILL after 5s), and `callAgent` resolves `ok: false` with the new `CallError` reason `output-limit`, whose `detail` names the stream. The output read so far stays in `raw`, truncated to the cap on a UTF-8 character boundary, and the new `RawProcessOutput.outputLimit` names the stream that passed it. A timeout or abort that came first stays the cause, and `outputLimit` still marks a stream it truncated. `Infinity` means no cap and a fraction rounds up; `0`, a negative value or `NaN` makes `callAgent` reject with a `RangeError`, and a value that is not a number with a `TypeError`, the same rule as `@osdlc/command-seam`. Output is now read as bytes and decoded with the same streaming UTF-8 decoder as before, so collected text is unchanged.
- 778129e: Add `onOutput` to `CallOptions`: a callback that gets the agent's output as it arrives, for a host that shows progress while a person waits. Each call gets a chunk of decoded UTF-8 text, whole characters only, and its stream (`'stdout'` or `'stderr'`); one stream's chunks join to exactly what `raw` collects. Output is still collected and parsed as before, and nothing is delivered past `maxOutputBytes`. A throw from the callback, or a rejection of a promise it returns, is swallowed, stops later calls for that run, and does not affect the result.
- 03e5f5d: **Breaking:** adds `none` and `minimal` to `EffortLevel` and `EFFORT_LEVELS`, below `low`. An exhaustive `switch` or a `Record<EffortLevel, …>` must now handle them. codex and opencode pass them through; claude and antigravity raise them to `low` and record an approximation note. The claude launch argv helper does the same, and the pi launch argv helper sends `none` as `off`.

## 0.4.1

### Patch Changes

- 828fa0f: The changelog no longer names a private repository.

## 0.4.0

### Minor Changes

- e02c4d9: The first release on npm. Earlier versions were used only during development and were never
  published, so this entry lists everything the package does. It is one call spec for headless
  coding-agent CLIs: describe the prompt, permissions, context, output shape and session once, and
  each adapter turns it into a `claude`, `codex`, `agy` (Antigravity) or `opencode` command line,
  recording every approximation. Results come back normalized, with the raw output kept. No
  dependencies.
  
  - The call spec: `AgentCallSpec` with `PermissionSpec`, `PermissionMode`, `ContextSpec`,
    `OutputSpec`, `OutputFormat`, `SessionSpec`, `McpSpec`, `PluginSpec` and `AgentName`.
    `EFFORT_LEVELS` (`low`, `medium`, `high`, `xhigh`, `max`) and `EffortLevel` are also exported
    from `@osdlc/agent-call/models`, which has no Node imports.
  - Planning and running: `planCall` turns a spec into a `PlannedCall` with no side effects, and
    `callAgent` runs it with a library-level timeout. Supporting types and values: `CapabilityNote`,
    `Support`, `TempFile`, `TMP_TOKEN`, `AgentResult`, `CallError` and `CallOptions`. Agent failures
    come back as `ok: false` with a `CallError`; `callAgent` rejects only when planning throws,
    a temp file name is not a plain file name, or the temp directory cannot be written. A nonzero
    exit reports the parser's text, the exit code and the end of stderr together in
    `error.detail`, and a caller abort reports `aborted by the caller`.
  - Built-in adapters: `claudeAdapter`, `codexAdapter`, `antigravityAdapter` and `opencodeAdapter`,
    with their options types `ClaudeAdapterOptions`, `CodexAdapterOptions`,
    `AntigravityAdapterOptions` and `OpencodeAdapterOptions`, plus `adapterFor`, `BUILTIN_AGENTS`,
    `detectAgents` and `AgentAvailability`.
  - Your own adapters: `customAdapter` and `CustomAdapterOptions` for any one-shot CLI (they note
    the fields they fold into the prompt and `permissions.mode`, and not the fields your `args`
    leave out), and the contract types `AgentAdapter`, `ParsedOutput` and `RawProcessOutput`.
  - The conversation model `agent-conversation/1`, from `callAgent` with `captureConversation`:
    `Conversation`, `ConversationMessage`, `Part`, `Role`, `Usage`, `CONVERSATION_SCHEMA`,
    `assistantText` and `toolCalls`.
  
  The claude adapter passes MCP server config as a temp file, so tokens in server `env` stay off the
  command line. codex has no file option and uses `-c` overrides.
  
  Eight exports are experimental and may change in any minor release: `modelArgs`,
  `modelArgsRefusal`, `ModelChoice`, `templateAdapter`, `templateRefusal`, `TemplateAdapterOptions`,
  `claudePluginArgv` and `claudeResumeFlag`. They build launch arguments for callers that assemble
  a command line themselves. The other exports are stable within 0.x: a breaking change goes in a
  minor release and is marked `Breaking` in the changelog. `CallError.reason` is open, so a minor
  release may add a reason. `CallOptions` accepts `undefined` for its optional fields, and
  `BUILTIN_AGENTS` and `EFFORT_LEVELS` are frozen.
  
  The history before this release is in CHANGELOG.md. Node.js 22 or later, ESM only, shipped as
  compiled JavaScript with type declarations. Tested on Linux and macOS; Windows is untested, and on
  Windows a timeout may not stop the agent's child processes. The agent runs in its own process group
  and keeps running if the host is interrupted, so a host that can be interrupted must abort its calls
  through the `signal` option. `detectAgents` reports a CLI as unavailable when `--version` has not
  finished within 10 seconds. `templateAdapter` throws when `promptVia` and the `{prompt}` slot
  disagree. Licensed `MIT OR Apache-2.0`.

## History before the first public release

These versions were never published. The package was developed in a private repository. The
version numbers were assigned afterwards, from its git history, and have no tags.

### [0.3.0] - 2026-10-11 (unpublished)

#### Added

- `modelArgs(tool, choice)` and `modelArgsRefusal(tool, choice)` build the model and effort
  flags for the claude, codex and pi CLIs from a resolved `ModelChoice`, and refuse a tool that
  has no such flags. `ModelChoice.via` holds a launch mode's flags, placed before the model.
- `templateAdapter` runs a CLI from an argument template with `{prompt}`, `{model}` and
  `{effort}` slots; `templateRefusal` says why a template cannot take a choice.

#### Changed

- `EFFORT_LEVELS` gains `xhigh`: `low, medium, high, xhigh, max`. claude takes it as
  `--effort xhigh`, codex as `model_reasoning_effort`, opencode as `--variant`; antigravity
  clamps it, like `max`, to `--effort high`.
- The codex adapter passes every effort through, `max` included. It used to send `max` as
  `high`.

#### Removed

- **Breaking:** model tiers left the call spec. The `modelTier` field of `AgentCallSpec`, the
  `ModelTier` type, the `CLAUDE_TIER_MODEL` table and the `applyModelTier` helper are removed.
  Pass a concrete model in `model`.

### [0.2.0] - 2026-10-10 (unpublished)

#### Changed

- **Breaking:** the `gemini` adapter is replaced by `antigravity`. `AgentName` swaps `'gemini'` for
  `'antigravity'`, and `BUILTIN_AGENTS`, `adapterFor` and `detectAgents` follow.
  `antigravityAdapter` and `AntigravityAdapterOptions` drive the `agy` CLI headlessly; effort,
  the output schema, session continuation and the permission posture map to native flags.

#### Removed

- **Breaking:** `geminiAdapter`, `GeminiAdapterOptions` and `GEMINI_TIER_MODEL`. Use
  `antigravityAdapter`.

### [0.1.7] - 2026-10-06 (unpublished)

#### Added

- `AgentCallSpec.plugins` (`PluginSpec`), claude only: `dirs` load with `--plugin-dir`, and
  `disable` turns installed plugin ids off through `--settings`.
- `claudePluginArgv(plugins)` and `claudeResumeFlag(id)` are exported.

#### Fixed

- The claude adapter passes `session.resume` as `--resume=<id>`, so an id that starts with `-`
  stays bound to the flag.

### [0.1.6] - 2026-10-05 (unpublished)

#### Added

- The `./models` entry point exports `EFFORT_LEVELS` and the effort and tier types with no Node
  imports, so a browser bundle can use them.

### [0.1.5] - 2026-10-05 (unpublished)

#### Added

- `EFFORT_LEVELS` and the claude and gemini tier-to-model tables are exported.

### [0.1.4] - 2026-09-05 (unpublished)

#### Fixed

- The spec types accept an explicit `undefined` for every optional field, so callers that use
  `exactOptionalPropertyTypes` compile.

### [0.1.3] - 2026-09-05 (unpublished)

#### Added

- `RawProcessOutput.stdinError` records a prompt that could not be fully written to the
  child's stdin, so a caller can tell that the agent answered a truncated prompt.

#### Fixed

- An agent that exited without reading its stdin no longer crashes the calling process.
- Multi-byte characters split across two reads of stdout or stderr are decoded correctly.
- The gemini adapter no longer applies `systemPrompt` twice.
- An already-aborted signal stops the call before the agent is spawned.
- A claude `stream-json` run that ends without its result event reports an `agent-error`,
  with the events still returned. A caller that ignored the missing envelope saw `ok: true`
  before.

### [0.1.2] - 2026-08-24 (unpublished)

#### Fixed

- Permission-mode and model-tier flags are built from shared tables in the claude, codex and
  gemini adapters. The argv and the capability notes are unchanged.

### [0.1.1] - 2026-07-12 (unpublished)

#### Fixed

- A timeout or abort kills the agent's whole process group, so a child that started its own
  children no longer keeps the call running past its deadline.

### [0.1.0] - 2026-07-12 (unpublished)

#### Added

- `AgentCallSpec`: one agent call in agent-agnostic terms (prompt, model and model tier,
  reasoning effort, system prompts, permission posture, context files and directories, output
  format and JSON schema, session behaviour, MCP servers, budget, timeout). Only `prompt` is
  required.
- `planCall(adapter, spec)` translates a spec into a `PlannedCall` (argv, stdin, env, temp
  files) with no side effects. Every planned call carries one `CapabilityNote` per field that
  did not map one to one: `native`, `approximated`, `emulated` or `dropped`.
- Adapters for `claude`, `codex`, `gemini` and `opencode`, `customAdapter` for any one-shot
  CLI, and `detectAgents` to probe which CLIs are installed.
- `callAgent(adapter, spec)` runs the planned call with a library-level timeout and never
  throws on agent failure: errors are `spawn-failed`, `timeout`, `nonzero-exit` or
  `agent-error`.
- `AgentResult` carries the final text, structured output, session id, token usage, cost and
  the plan that ran, with raw stdout and stderr kept.
- `captureConversation: true` lifts a transcript into `agent-conversation/1`: role-tagged
  messages of typed parts with usage, cost, duration and stop reason.

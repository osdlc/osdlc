# Changelog

## History before the first public release

These versions were never published. The package was developed in the sksizer/dev repository. The
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

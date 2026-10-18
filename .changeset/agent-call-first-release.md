---
'@osdlc/agent-call': minor
---

The first release on npm. Earlier versions were used only during development and were never
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

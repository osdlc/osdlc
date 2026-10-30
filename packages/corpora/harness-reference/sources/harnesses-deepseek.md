---
title: 'DeepSeek Harness (dsh): harness notes for a dispatcher'
description: How DeepSeek Harness (dsh) 0.2.1-alpha.1 opens, resumes and runs sessions headlessly, and what a skill or plugin publisher can project into it.
retrieved: 2026-10-08
---
# DeepSeek Harness (dsh): harness notes for a dispatcher

Source: the `deepseek-ai/deepseek-harness` repository (MIT) at commit `5badb150` (2026-10-03),
read from source and package READMEs on 2026-10-08. Nothing was installed or run, so no fact here
comes from `dsh --help` output. The CLI is npm `@deepseek-ai/dsh`, version `0.2.1-alpha.1`, a
developer preview that warns of breaking changes. Facts are marked **verified** (read in source or
docs, path given relative to that repo's root) or **inferred** (a reading not confirmed in source).

dsh is built differently from claude, codex and pi. It is one binary, `dsh`, assembled from YAML
plugin "patch" layers (Cordis). What other harnesses do with subcommands or flags, dsh does with
**profiles**: `dsh <name>` is shorthand for `dsh --profile <name>`. The shipped profiles include
`web`, `headless`, `acp` and `sdk` (`apps/cli/README.md`). The model, provider, permission mode,
MCP servers and hooks are all config rows, not CLI flags.

## Open with a known id and name

- **Verified.** There is no flag that opens a new session under a chosen id or name. Every
  headless run mints an opaque `session-<uuid>`, which `--json` reports in its opening `session`
  event (`packages/bundle/headless/README.md`, "Session identity").
- **Verified.** Sessions are stored at
  `$DSH_HOME/sessions/--<normalized-cwd>--/<encoded-id>/session.vN.jsonl.zstd`. `$DSH_HOME`
  defaults to `~/.dsh`. Each log is an append-only, zstd-compressed JSONL stream
  (`packages/session/session-persistence-jsonl/README.md`, "On-disk layout"). The writer is
  session format V4: finalized, but not in any release yet. The latest released format is V3
  (`docs/session-format-status.md`).

## Resume by id with a prompt

- **Verified.** `dsh --profile headless --session-id <id> "<prompt>"` continues a stored session
  (`packages/bundle/headless/src/startup.ts:43-44`). An unknown id is an error, not a fresh
  session. Resuming is refused when:
  - the session was recorded under a different cwd;
  - it is a subagent or fork session;
  - another agent in the same process already holds that id;
  - it uses a preset the profile does not compose.
- **Verified: not available.** The CLI has no fork. Forking exists only internally, for subagents.

## Native send to a live session

- **Verified: not available headlessly.** Each headless run handles exactly one task and then
  exits. There is no follow-up or steering channel.
- **Verified.** The `acp` profile (`dsh --profile acp`) serves the Agent Client Protocol over
  stdio (`packages/acp/acp/README.md`).
  - Supported: `session/new`, `session/list`, `session/resume`, `session/prompt`,
    `session/cancel`, `session/close`, and `session/set_config_option` (`model`,
    `reasoning_effort`). `session/new` can also attach MCP servers.
  - Not supported: `session/load`, delete and fork.
  - A session takes one prompt at a time, and no mid-turn steering is documented.
- **Verified.** The `sdk` profile speaks JSON-RPC over stdio with only `initialize`,
  `session/prompt` and `shutdown`. It has no cancel or close (`packages/sdk/protocol/README.md`).
- **Inferred.** A dispatcher that wants to send into a live session would hold the `acp` process
  open and call `session/prompt` again. That is a long-lived process, not the
  fire-and-forget model used for the other harnesses.

## Headless mode

- **Verified.** Run with `dsh --profile headless [--json] [--session-id <id>] <task…>`. The task
  can also be piped on stdin, either by omitting it or by passing `-`. These two flags are the
  whole option surface (`packages/bundle/headless/src/startup.ts:38-52`).
  - Without `--json`, the final answer goes to stdout and reasoning streams to stderr under
    `dsh: reasoning:`.
  - With `--json`, events are written as JSONL (`packages/bundle/headless/src/json-stream.ts`).
- **Verified.** The `--json` event types:
  - `session` `{sessionId, cwd}`
  - `status` `{phase: turn_start|step_start|step_end|turn_end, turn, step?, usage?, reason?}`
  - `thinking` and `text` `{text}`
  - `tool_call` `{callId, tool, input}`
  - `tool_result` `{callId, status, result}`
  - `final` `{text}`
  - `error` `{message}`

  Events are emitted when a step commits, not per token. Strings are capped at 8 KiB and lines at
  32 KiB; `final` is not capped. The README calls the stream "a projection, not the log". It
  carries no schema version.
- **Verified.** Exit code is 0 only when the final `turn/end` reason is `completed`, and 1
  otherwise. Errors print `dsh: <code>: <message>` to stderr. Under `--json`, a failed run writes
  an `error` event and no `final`, and even a usage error still writes an `error` event. A failure
  during startup or plugin loading also writes `$DSH_HOME/logs/startup-*.log`.
- **Verified.** Neither model, provider, base URL, working directory, approval nor max-turns has
  a flag.
  - Working directory: the process cwd.
  - Model: the `agent-default-model` config row, which defaults to provider `deepseek-official`
    and model `deepseek-flash` (`packages/bundle/base/cordis.patch.yml:82-86`). Override it in
    `$DSH_HOME/profiles/headless/cordis.patch.yml`, `$DSH_HOME/cordis.patch.yml`, or a
    `--patch <file>` given before the profile arguments.
  - Max turns: no setting found.
- **Verified.** `DSH_PERMISSION_MODE` sets permissions to `read-only`, `workspace-write` (the
  default) or `danger-full-access` (`packages/bundle/base/cordis.patch.yml:229-262`). Every mode
  except `danger-full-access` uses approval policy `ask`. Headless ships no approval answerer, so
  an approval request resolves to `unavailable` and is rejected immediately. A run without a
  human never hangs on a prompt (`packages/interaction/user-approval/README.md`, "Limits").

## Usage and cost

- **Verified.** Tokens are reported per step. `status` events with `phase: step_end` carry
  `usage {inputTokens, outputTokens, totalTokens?, cacheReadTokens?, cacheWriteTokens?,
  reasoningTokens?}`. `usage` is left out of a step if any attempt in it reported none
  (`packages/llm/llm/src/types.ts:175-189`, `json-stream.ts:282-285`). Usage is also recorded on
  `assistant/message` events in the session log.
- **Verified: not available.** dsh reports no cost in currency. A dispatcher must price tokens
  itself using DeepSeek's published rates.

## Configuration and sign-in

- **Verified.** Config layers apply in this order:
  1. bundle patches;
  2. `$DSH_HOME/profiles/<name>/cordis.patch.yml`;
  3. `$DSH_HOME/cordis.patch.yml`;
  4. `--patch` files.

  A later layer replaces a row's whole `config` rather than merging into it. There is no
  per-project config file (`apps/cli/README.md`).
- **Verified.** The API key comes from `DEEPSEEK_API_KEY`, and `DEEPSEEK_BASE_URL` overrides the
  endpoint. The DeepSeek adapter speaks the Anthropic Messages wire format against
  `https://api.deepseek.com/anthropic` (`packages/llm/llm-deepseek/README.md`).
- **Verified.** Credentials are looked up in order: the launch environment,
  `$DSH_HOME/.credentials.yaml`, the project `.env`, then `$DSH_HOME/.env`
  (`packages/credentials/credentials-local/README.md`).
- **Verified.** Other providers (anthropic, openai, moonshotai, zai, and custom endpoints) are
  available through the `llm-pi-ai` adapter (`docs/user/guide/providers.md`).
- **Verified.** Anonymous telemetry is on by default in feedback-only mode. Set
  `DSH_TELEMETRY_DISABLED` to opt out (`packages/bundle/base/cordis.patch.yml:188-218`). A
  dispatcher should set it unless the user opts in.

## Plugin projection surface

What a skill or plugin publisher can project into dsh:

- **Instructions, verified.** dsh loads `AGENTS.md` and `CLAUDE.md` from the git root down to the
  cwd, plus the overlays `AGENTS.local.md` and `CLAUDE.local.md` and the user-level
  `$DSH_HOME/AGENTS.md`. The budget is 64 KiB. It does not read `DEEPSEEK.md`
  (`packages/context/agent-instructions/README.md`).
- **Skills, verified.** A skill is `<name>/SKILL.md` or a flat `<name>.md`, with required
  frontmatter `name` and `description`. The model loads skills through a `skill` tool. A user can
  run a user-invocable skill as `/name`. Roots are searched in priority order
  (`packages/skill/skill-filesystem/README.md:44-56`):
  1. `<proj>/.dsh/skills`
  2. `<proj>/.agents/skills`
  3. `customSkillDirs`
  4. `~/.dsh/skills`
  5. `~/.agents/skills`
- **Skills, inferred.** `allowed-tools` is not in the list of frontmatter fields dsh honours, so
  dsh probably ignores it.
- **Subagents, verified: no file format.** Subagents are tools the model calls (`subagent`,
  `subagent_fork`, `send_message` and others). Presets are YAML rows, and there is no
  `.claude/agents`-style Markdown loader.
- **Commands, verified: no file format.** Slash commands come from TypeScript plugins, and dsh has
  no loader for Markdown commands.
- **Hooks, verified.** The `@deepseek-ai/dsh-hooks-claude-code` bridge runs an unmodified Claude
  Code `hooks.json`, and a Codex bridge exists alongside it. No shipped profile turns it on; it
  has to be added as a YAML row with `configPath`, `pluginRoot` (which sets
  `${CLAUDE_PLUGIN_ROOT}`) and `projectDir`.
  - Supported events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
    `SubagentStart` and `SubagentStop`.
  - Matchers apply to dsh's tool names, not Claude's
    (`packages/hooks/hooks-claude-code/README.md`).
- **MCP, verified.** Each server is a YAML row for `@deepseek-ai/dsh-mcp-client`, with
  `serverName`, `transport` (`stdio` or `streamable-http`), and either `command`/`args`/`env` or
  `url`/`headers`. dsh reads no `mcpServers` JSON. Tools are named `mcp__<server>__<tool>`.
- **Plugins, verified.** A dsh plugin is an npm package whose `package.json` has
  `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}`. It is installed with
  `dsh plugin --profile <n> add <pkg>`, which passes through to pnpm. There is no Claude-style
  marketplace or manifest directory.
- **Tool names, verified.** dsh's tools are lower-case: `bash`, `read`, `write`, `edit`, `glob`,
  `grep`, `web_fetch`, `web_search`, `todo_write`, `ask_user_question`, `skill`, `subagent`
  (`docs/tool-catalog.md`). These matter for tool-name translation and for hook matchers.

## Fit for a publisher and a dispatcher

- **Inferred.** A skill written to `.agents/skills/<slug>/SKILL.md` already reaches dsh, since that
  is its second project root. A dsh-specific projection would add four things:
  - the `.dsh/skills` path;
  - tool-name translation;
  - a generated `cordis.patch.yml` carrying the hooks-bridge row and the MCP rows;
  - optionally, an npm-bundle export.
- **Inferred.** A headless dispatch uses
  `dsh --profile headless --json <msg>` to start, `--session-id <id>` to resume, JSONL usage, and
  the exit code for completion. A dispatcher must set four things through the environment or a
  generated `--patch` file:
  - the model;
  - `DSH_PERMISSION_MODE`;
  - `DSH_TELEMETRY_DISABLED`;
  - a `$DSH_HOME` for each dispatch, to keep sessions and config isolated.
- **Inferred.** Every surface here is pre-stable: an alpha version, an unreleased session format,
  a config schema labelled "pre-stable", and an unversioned `--json` stream. An adapter should pin
  a dsh version and parse defensively.

## Open questions

- Is `workspace-write` enough to commit and push from a git worktree, or does `git push`
  (network access) need an approval and therefore fail closed under headless? Settling this needs
  a live run.
- What is the exact V4 session filename, `session.v4.jsonl.zstd`? Only the V3 layout is
  documented.
- How do the hooks bridge's payload and exit-code semantics compare with Claude Code's, field by
  field? See "Payloads and environment" in `packages/hooks/hooks-claude-code/README.md`, which was
  not read in full.

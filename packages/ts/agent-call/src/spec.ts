/**
 * The description of one headless agent call, the same for every agent.
 *
 * A spec says what you want: prompt, permission posture, context, output
 * shape and session behavior. It does not say how a particular CLI expresses
 * it. Each built-in adapter translates the spec into a command line on a
 * best-effort basis and records every approximation as a `CapabilityNote` (see
 * plan.ts). Custom and template adapters note `permissions.mode` and the
 * fields they fold into the prompt. They do not note other fields that the
 * `args` builder leaves out.
 */

import type { EffortLevel } from './models.js'

/** Adapters shipped with this package. Custom adapters may use any name. */
export type AgentName =
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'opencode'
  | 'copilot'
  | 'pi'
  | 'qwen'
  | 'droid'
  | 'cursor'
  | 'deepseek'

/**
 * Permission posture, ordered from most to least restricted.
 *
 * - `read-only`  — the agent may read but not change anything.
 * - `default`    — the agent's own default posture.
 * - `edits`      — file edits are pre-approved. Shell and network still need
 *                  approval, which a headless run denies since nothing prompts.
 * - `full-auto`  — edits and workspace-scoped commands are pre-approved,
 *                  inside whatever sandbox the agent offers.
 * - `bypass`     — skip all approvals and sandboxing. Dangerous. Use it only
 *                  in an environment sandboxed from outside.
 */
export type PermissionMode = 'read-only' | 'default' | 'edits' | 'full-auto' | 'bypass'

/** Permission posture for a call: a mode, plus per-tool rules where the CLI has them. */
export interface PermissionSpec {
  mode?: PermissionMode | undefined
  /**
   * Tool patterns to pre-approve. Passed through verbatim where the agent
   * supports tool rules: claude's `--allowedTools "Bash(git *) Edit"`,
   * copilot's `--allow-tool` and qwen's `--allowed-tools`. pi and droid take
   * tool names. The other built-in adapters record it as dropped. Each agent
   * has its own tool names.
   */
  allowTools?: string[] | undefined
  /** Tool patterns to deny. Passed through the same way as `allowTools`. */
  denyTools?: string[] | undefined
}

/** What the agent should know about beyond the prompt: files, directories, free text. */
export interface ContextSpec {
  /**
   * Files the agent should consider. Attached with a flag where the CLI has
   * one (opencode `-f`). Otherwise a prompt preamble lists the paths, as
   * `@path` references for agents that read `@path` in the prompt.
   */
  files?: string[] | undefined
  /** Extra directories the agent may access (`--add-dir` or the agent's equivalent). */
  dirs?: string[] | undefined
  /** Free text prepended to the prompt on every agent. */
  text?: string | undefined
}

/** The shape of the CLI's output; see {@link OutputSpec.format}. */
export type OutputFormat = 'text' | 'json' | 'stream-json'

/** The output shape a call asks for: a format, and optionally a JSON Schema for the answer. */
export interface OutputSpec {
  /**
   * - `text`        — final answer as plain text.
   * - `json`        — one machine-readable envelope with metadata.
   * - `stream-json` — line-delimited JSON events as the run progresses.
   *
   * When omitted, adapters default to their richest aggregate format, so
   * usage, cost and session metadata can be captured. `AgentResult.text`
   * carries the final answer either way.
   */
  format?: OutputFormat | undefined
  /**
   * JSON Schema the final answer must satisfy. Passed with a flag where the
   * CLI has one (claude `--json-schema`, codex `--output-schema`). Otherwise
   * the prompt gets an instruction to respond only with matching JSON.
   * The parsed value goes in `AgentResult.structured`.
   */
  schema?: Record<string, unknown> | undefined
}

/** Session behaviour: pin an id, resume, continue the last session, or keep the run off disk. */
export interface SessionSpec {
  /** Pin the new session's id (claude, copilot, pi, qwen; droid and cursor approximate it). */
  id?: string | undefined
  /** Resume an existing session or thread by id. */
  resume?: string | undefined
  /** Resume the most recent session instead of naming one. */
  continueLast?: boolean | undefined
  /** Set false to keep the run off disk where supported. Defaults to the agent's own behavior. */
  persist?: boolean | undefined
}

/** MCP servers to expose to the agent for this call. */
export interface McpSpec {
  /**
   * MCP servers to expose to the agent, in the common `mcpServers` config
   * shape: name → `{command, args?, env?}` or `{url}`. Passed with a flag on
   * claude (`--mcp-config`), qwen and copilot (each from a temp file).
   * Written as `-c mcp_servers.*` overrides on codex and as a `--patch`
   * overlay on deepseek, and as a session-only `--plugin-dir` plugin on
   * cursor (approximated: user and project servers still load). The other
   * agents read MCP servers only from their config files, so it is dropped
   * there, with a note.
   */
  servers?: Record<string, Record<string, unknown>> | undefined
  /**
   * Use only these servers and ignore user and project config (claude and
   * qwen. copilot approximates it).
   */
  strict?: boolean | undefined
}

/**
 * Plugins for this session only (claude. copilot and cursor load `dirs` only).
 * `dirs` load with `--plugin-dir`. `disable` lists installed plugin ids
 * (`name@marketplace`) to turn off through `--settings`.
 */
export interface PluginSpec {
  dirs: string[]
  disable: string[]
}

/** One agent call. Only `prompt` is required. */
export interface AgentCallSpec {
  prompt: string
  /** Concrete model id or alias for the target agent, passed through as given. */
  model?: string | undefined
  effort?: EffortLevel | undefined
  mcp?: McpSpec | undefined
  plugins?: PluginSpec | undefined
  /** Replace the agent's system prompt. See the README capability map for how each agent does it. */
  systemPrompt?: string | undefined
  /** Append to the agent's system prompt. See the README capability map for how each agent does it. */
  appendSystemPrompt?: string | undefined
  permissions?: PermissionSpec | undefined
  context?: ContextSpec | undefined
  output?: OutputSpec | undefined
  session?: SessionSpec | undefined
  /** Hard dollar cap where supported (claude `--max-budget-usd`). */
  budgetUsd?: number | undefined
  /** Working directory for the agent process. */
  cwd?: string | undefined
  /** Extra environment variables for the agent process. */
  env?: Record<string, string> | undefined
  /** Kill the process after this long (SIGTERM, then SIGKILL after 5s). */
  timeoutMs?: number | undefined
  /**
   * Cap each output stream, stdout and stderr, at this many bytes read. A
   * stream that passes it stops the process group as a timeout does (SIGTERM,
   * then SIGKILL after 5s), and the result is `ok: false` with reason
   * `output-limit`. The output read so far is kept in `raw`, cut to the cap on
   * a UTF-8 character boundary. The cap counts the bytes the agent wrote, not
   * the decoded text. Bytes that are not valid UTF-8 decode to U+FFFD, which
   * is 3 bytes, so a string can be longer than the cap in UTF-8. `Infinity`
   * means no cap, and a fraction rounds up. `0`, a negative value or `NaN`
   * makes `callAgent` reject with a `RangeError`, and a value that is not a
   * number with a `TypeError`.
   */
  maxOutputBytes?: number | undefined
  /** Appended verbatim to the end of the built argv. */
  extraArgs?: string[] | undefined
}

/**
 * The canonical, agent-agnostic description of one headless agent call.
 *
 * A spec says WHAT you want — prompt, permission posture, context, output
 * shape, session behavior — never HOW a particular CLI expresses it. Each
 * built-in adapter translates the spec into a concrete invocation on a
 * best-effort basis and records every approximation as a `CapabilityNote` (see
 * plan.ts). Custom and template adapters note the fields they fold into the prompt and
 * `permissions.mode`; any other field the `args` builder leaves out is not noted.
 */

import type { EffortLevel } from './models.js'

/** Adapters shipped with this package. Custom adapters may use any name. */
export type AgentName = 'claude' | 'codex' | 'antigravity' | 'opencode'

/**
 * Canonical permission posture, ordered from most to least restricted.
 *
 * - `read-only`  — the agent may inspect but not mutate anything.
 * - `default`    — whatever the agent's own default posture is.
 * - `edits`      — file edits are pre-approved; shell/network still gated
 *                  (gated means denied under headless runs — nothing prompts).
 * - `full-auto`  — edits and workspace-scoped commands pre-approved, inside
 *                  whatever sandbox the agent offers.
 * - `bypass`     — skip all approvals and sandboxing. Dangerous; intended for
 *                  externally sandboxed environments only.
 */
export type PermissionMode = 'read-only' | 'default' | 'edits' | 'full-auto' | 'bypass'

/** Permission posture for a call: a canonical mode, plus per-tool rules where the CLI has them. */
export interface PermissionSpec {
  mode?: PermissionMode | undefined
  /**
   * Tool patterns to pre-approve. Passed through verbatim where the agent
   * supports tool rules (claude's `--allowedTools "Bash(git *) Edit"`);
   * recorded as dropped by the other built-in adapters.
   */
  allowTools?: string[] | undefined
  /** Tool patterns to deny. Same passthrough semantics as `allowTools`. */
  denyTools?: string[] | undefined
}

/** What the agent should know about beyond the prompt: files, directories, free text. */
export interface ContextSpec {
  /**
   * Files the agent should consider. Attached natively where the CLI supports
   * it (opencode `-f`), otherwise emulated with a prompt preamble that lists
   * the paths (and `@path` references for agents with @-inclusion syntax).
   */
  files?: string[] | undefined
  /** Extra directories the agent may access (`--add-dir` and friends). */
  dirs?: string[] | undefined
  /** Freeform context prepended to the prompt on every agent. */
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
   * When omitted, adapters default to their richest aggregate format so
   * usage/cost/session metadata can be captured; `AgentResult.text` always
   * carries the final answer regardless.
   */
  format?: OutputFormat | undefined
  /**
   * JSON Schema the final answer must satisfy. Native where supported
   * (claude `--json-schema`, codex `--output-schema`), otherwise emulated by
   * appending a strict respond-only-with-JSON instruction to the prompt.
   * The parsed value lands in `AgentResult.structured`.
   */
  schema?: Record<string, unknown> | undefined
}

/** Session behaviour: pin an id, resume, continue the last session, or keep the run off disk. */
export interface SessionSpec {
  /** Pin the new session's id (claude only). */
  id?: string | undefined
  /** Resume an existing session/thread by id. */
  resume?: string | undefined
  /** Resume the most recent session instead of naming one. */
  continueLast?: boolean | undefined
  /** Set false to keep the run off disk where supported (default: agent's own). */
  persist?: boolean | undefined
}

/** MCP servers to expose to the agent for this call. */
export interface McpSpec {
  /**
   * MCP servers to expose to the agent, in the common `mcpServers` config
   * shape: name → `{command, args?, env?}` or `{url}`. Native on claude
   * (`--mcp-config`), rendered to `-c mcp_servers.*` overrides on codex,
   * config-file-only (dropped, with a note) on antigravity/opencode.
   */
  servers?: Record<string, Record<string, unknown>> | undefined
  /** Use ONLY these servers, ignoring user/project config (claude only). */
  strict?: boolean | undefined
}

/**
 * Plugins for this session only (claude only). `dirs` load with
 * `--plugin-dir`; `disable` lists installed plugin ids (`name@marketplace`)
 * turned off through `--settings`.
 */
export interface PluginSpec {
  dirs: string[]
  disable: string[]
}

/** The canonical call. Only `prompt` is required. */
export interface AgentCallSpec {
  prompt: string
  /** Concrete model id or alias for the target agent, passed through as given. */
  model?: string | undefined
  effort?: EffortLevel | undefined
  mcp?: McpSpec | undefined
  plugins?: PluginSpec | undefined
  /** Replace the agent's system prompt (native on claude; else emulated). */
  systemPrompt?: string | undefined
  /** Append to the agent's system prompt (native on claude; else emulated). */
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
  /** Escape hatch: appended verbatim to the built argv, after everything. */
  extraArgs?: string[] | undefined
}

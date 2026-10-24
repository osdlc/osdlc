import type { Conversation, Usage } from '../conversation.js'
import type { PlannedCall } from '../plan.js'
import type { AgentCallSpec } from '../spec.js'

/** What actually came back from the child process. */
export interface RawProcessOutput {
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  /** The run was cut short: a timeout elapsed, or the caller aborted. */
  timedOut: boolean
  /** Which came first when the run was cut short: the timeout or a caller abort. */
  cutShortBy?: 'timeout' | 'abort' | undefined
  /**
   * The first stream that passed `maxOutputBytes`. A stream that passed the
   * cap is cut to it on a character boundary. A stream under the cap is left
   * whole. When the cap stopped the run, `timedOut` is `false`. When a
   * timeout or abort came first, `timedOut` is `true` and stays the cause, and
   * this field still marks the truncation.
   */
  outputLimit?: 'stdout' | 'stderr' | undefined
  /** The signal that ended the child, when it died on one (for example `SIGKILL`). */
  signal?: string | undefined
  /**
   * The prompt could not be fully written to the child's stdin, because the
   * child exited or closed the pipe first. The agent answered a truncated
   * prompt. Absent when the write completed.
   */
  stdinError?: string | undefined
  /** Contents of `readBack` temp files, keyed by `TempFile.name`. */
  files?: Record<string, string> | undefined
}

/** Adapter-parsed view of a raw run, before assembly into an AgentResult. */
export interface ParsedOutput {
  /** Best-effort final assistant answer as plain text. */
  text: string
  /** Parsed JSON answer when `output.schema` was requested. */
  structured?: unknown | undefined
  sessionId?: string | undefined
  usage?: Usage | undefined
  costUsd?: number | undefined
  model?: string | undefined
  stopReason?: string | undefined
  /** Parsed JSONL events when a streaming format was used. */
  events?: unknown[] | undefined
  /** The agent itself reported failure (distinct from a nonzero exit). */
  isError?: boolean | undefined
  errorDetail?: string | undefined
}

/**
 * One agent CLI. `plan` turns a spec into a command line, and `parseResult`
 * turns output into fields. Both are pure. The runner does all process
 * handling, so adapters are easy to unit test.
 */
export interface AgentAdapter {
  name: string
  /** Binary to spawn. Override it with each adapter factory's `binary` option. */
  binary: string
  /**
   * The full command prefix, such as `['npx', '-y', '@anthropic-ai/claude-code']`
   * or just `['claude']`. `binary` is its first element. The built-in adapters
   * always set it. `detectAgents` runs it, or `binary` when it is absent, so
   * an adapter copied with a new `binary` (`{ ...claudeAdapter(), binary }`)
   * must also replace `command`. Pass `binary` or `command` to the factory
   * instead.
   */
  command?: readonly string[] | undefined
  plan(spec: AgentCallSpec): PlannedCall
  parseResult(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput
  /** Optional: convert the raw transcript into the normalized conversation model. */
  toConversation?(planned: PlannedCall, raw: RawProcessOutput): Conversation | undefined
}

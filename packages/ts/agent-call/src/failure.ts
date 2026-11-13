import type { AgentAdapter } from './adapters/types.js'
import { adapterFor, BUILTIN_AGENTS } from './registry.js'
import type { AgentName } from './spec.js'

/**
 * Why a provider refused a run, when the output says. Set on
 * `CallError.cause` and returned by `classifyFailure`.
 *
 * - `auth` — the credential is missing, expired or rejected.
 * - `rate-limit` — a usage or rate limit was hit. `resetAt` is an ISO 8601
 *   time when the output states one, else `null`. `limit` names the limit in a
 *   few words, such as `weekly limit`, `5-hour limit`, `usage limit` or
 *   `rate limited (429)`.
 * - `quota` — credit or billing is exhausted. The key will not work until it
 *   is topped up.
 *
 * The kinds are open: a later minor release may add one.
 *
 * @experimental The wording each CLI uses is matched from published messages,
 * not live captures, so what is classified may change in a minor release.
 */
export type FailureCause =
  | { kind: 'auth' }
  | { kind: 'rate-limit'; resetAt: string | null; limit: string }
  | { kind: 'quota' }

/**
 * The part of a finished run that classification reads. A `RawProcessOutput`
 * fits, and so does the output of a process you spawned yourself.
 *
 * @experimental
 */
export interface FailureOutput {
  stdout: string
  stderr: string
  /** `null` when the process did not exit on its own (killed, or never started). */
  exitCode: number | null
}

/**
 * Say why a failed run failed, for a caller that spawned the CLI itself. Pass
 * the adapter or the built-in agent name, and the run's output. `now`
 * resolves a relative or wall-clock reset time such as "resets 3pm" (default:
 * the current time).
 *
 * Returns `undefined` when the run succeeded, when the cause is not one of
 * `FailureCause`, and for an adapter that cannot classify (only `claude`,
 * `codex` and `cursor` can). Only the failure text is read, never the agent's
 * own answer, so an answer that talks about rate limits is not a rate limit.
 * Never throws.
 *
 * @experimental
 */
export function classifyFailure(
  agent: AgentAdapter | AgentName,
  output: FailureOutput,
  options: { now?: Date } = {},
): FailureCause | undefined {
  try {
    const adapter = typeof agent === 'string' ? builtin(agent) : agent
    return adapter?.classifyFailure?.(output, options)
  } catch {
    return undefined
  }
}

function builtin(name: string): AgentAdapter | undefined {
  return (BUILTIN_AGENTS as readonly string[]).includes(name)
    ? adapterFor(name as AgentName)
    : undefined
}

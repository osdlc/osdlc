/**
 * Checking settings once, where they come in, so a bad value fails the run
 * with its name instead of degrading every judgement or stalling the fan-out.
 */
import { BUILTIN_AGENTS, type AgentName } from '@osdlc/agent-call'

import { SEVERITY_ORDER, type ReviewConfig, type Severity } from './types.ts'

/** True when `name` is an engine `@osdlc/agent-call` can dispatch to. */
export function isEngine(name: string): name is AgentName {
  return (BUILTIN_AGENTS as readonly string[]).includes(name)
}

/** True when `level` is a severity. */
export function isSeverity(level: string): level is Severity {
  return (SEVERITY_ORDER as readonly string[]).includes(level)
}

/**
 * Throw when a setting is out of range. `engine` is checked only when the
 * run dispatches through agent-call, since a custom dispatch may use any name.
 */
export function validateConfig(config: ReviewConfig, opts: { engine: boolean }): void {
  const bad = (field: string, expected: string, value: unknown): Error =>
    new Error(`${field} expects ${expected} (got ${String(value)})`)
  if (opts.engine && !isEngine(config.engine)) {
    throw bad('engine', `one of ${BUILTIN_AGENTS.join(', ')}`, `'${config.engine}'`)
  }
  const c = config.concurrency
  if (!(c === Number.POSITIVE_INFINITY || (Number.isInteger(c) && c >= 1))) {
    throw bad('concurrency', 'a positive integer or Infinity', c)
  }
  if (!(Number.isInteger(config.maxFilesPerJob) && config.maxFilesPerJob >= 0)) {
    throw bad('maxFilesPerJob', 'a non-negative integer', config.maxFilesPerJob)
  }
  if (!(Number.isFinite(config.timeoutMs) && config.timeoutMs > 0)) {
    throw bad('timeoutMs', 'a positive number', config.timeoutMs)
  }
  if (!(Number.isFinite(config.maxPromptBytes) && config.maxPromptBytes >= 0)) {
    throw bad('maxPromptBytes', 'a non-negative number', config.maxPromptBytes)
  }
  if (!isSeverity(config.severityFloor)) {
    throw bad('severityFloor', SEVERITY_ORDER.join(', '), `'${config.severityFloor}'`)
  }
}

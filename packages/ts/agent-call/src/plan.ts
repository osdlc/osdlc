import type { AgentCallSpec, OutputFormat } from './spec.js'

/**
 * How faithfully a spec field survived translation to a concrete CLI call.
 *
 * - `native`       — the CLI has a first-class flag for it.
 * - `approximated` — mapped to the closest available behavior.
 * - `emulated`     — reproduced through prompt engineering or env plumbing.
 * - `dropped`      — the CLI has no way to express it; the field was ignored.
 */
export type Support = 'native' | 'approximated' | 'emulated' | 'dropped'

/** How one spec field was translated for one CLI, and why. */
export interface CapabilityNote {
  /** Dotted path into the spec, e.g. `"permissions.mode"`. */
  field: string
  support: Support
  detail: string
}

/**
 * Placeholder that adapters embed in argv/env values wherever a temp-file
 * path is needed. The runner replaces it with a real per-call temp directory
 * after materializing `PlannedCall.tempFiles`.
 */
export const TMP_TOKEN = '__AGENT_CALL_TMP__'

/** A file the runner writes into the per-call temp directory before the spawn. */
export interface TempFile {
  /** File name inside the per-call temp directory. */
  name: string
  /** Content written before spawn. Empty string reserves the path only. */
  content: string
  /** Read the file back after the run (exposed as `RawProcessOutput.files`). */
  readBack?: boolean | undefined
}

/**
 * A fully translated call: pure data, no side effects. `planCall()` produces
 * one without running anything, so you can inspect, log, or golden-test the
 * exact invocation an adapter would make.
 */
export interface PlannedCall {
  agent: string
  /** argv[0] is the binary. */
  argv: string[]
  /** Written to the child's stdin when set (how most prompts travel). */
  stdin?: string | undefined
  /** The prompt when it travels in argv rather than stdin, kept so a conversation can report it. */
  prompt?: string | undefined
  /** Environment additions (merged over the parent env by the runner). */
  env: Record<string, string>
  cwd?: string | undefined
  /** The output format actually requested from the CLI. */
  outputFormat: OutputFormat
  tempFiles: TempFile[]
  notes: CapabilityNote[]
  /** The canonical spec this call was planned from. */
  spec: AgentCallSpec
}

export function note(
  notes: CapabilityNote[],
  field: string,
  support: Support,
  detail: string,
): void {
  notes.push({ field, support, detail })
}

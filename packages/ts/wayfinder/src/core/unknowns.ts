/**
 * What wayfinder could not know about a catalog, each with the one label
 * every surface shows for it. The JSON documents carry the same list, so a
 * script reads the words a person sees.
 *
 * Browser-safe: no Node built-in.
 */

import type {
  ParametersUnknownReason,
  RunnerCacheState,
  RunnerReport,
  StaleReason,
} from '@osdlc/system-model/detect'

import {
  countTasks,
  missingBinaryLabel,
  parametersUnknownLabel,
  runnerLabel,
  staleLabel,
  withheldLabel,
  type ExecOffSource,
  type WithheldReason,
} from '../vocabulary.ts'
import type { Settings } from '../config.ts'

/**
 * One thing wayfinder could not know. `label` is the wording every surface
 * shows; the other fields are the facts behind it.
 */
export type Unknown =
  | {
      /** A runner that was not read, because reading it means running it. */
      kind: 'withheld'
      runner: string
      reason: WithheldReason
      /**
       * The trust scopes this runner still needs: its own id and each tool
       * manager that wraps it. A grant for each (`way trust --scope <id>`)
       * lets it run. Absent when trust is not what withholds it.
       */
      missing?: string[] | undefined
      label: string
    }
  | {
      /** Tasks whose parameters could not be read. */
      kind: 'parameters'
      runner: string
      reason: ParametersUnknownReason
      /** The ids of those tasks. */
      tasks: string[]
      label: string
    }
  | {
      /** A runner answered from a stored probe that is out of date. */
      kind: 'stale'
      runner: string
      reason?: StaleReason | undefined
      ageMs?: number | undefined
      label: string
    }
  | {
      /** A runner whose tool is not on the PATH. */
      kind: 'binary'
      runner: string
      binary: string
      label: string
    }

/** What {@link unknownsOf} reads. */
export interface UnknownsInput {
  reports: readonly RunnerReport[]
  /** The cache verdicts, when the catalog came from the store. */
  cache?: readonly RunnerCacheState[] | undefined
  /** Why withheld runners were withheld. Default `untrusted`. */
  withheld?: WithheldReason | undefined
  /** For `exec-off`: what turned execution off. */
  execOff?: ExecOffSource | undefined
  /** The trust scopes a runner still needs, when per-tool trust is known. */
  missingScopes?: ((runner: string) => string[] | undefined) | undefined
}

/** Every unknown in a catalog, in report order. */
export function unknownsOf(input: UnknownsInput): Unknown[] {
  const out: Unknown[] = []
  const withheld = input.withheld ?? 'untrusted'
  for (const report of input.reports) {
    const runner = report.runner
    if (report.skippedForExec) {
      const missing = withheld === 'exec-off' ? undefined : input.missingScopes?.(runner)
      out.push({
        kind: 'withheld',
        runner,
        reason: withheld,
        ...(missing !== undefined ? { missing } : {}),
        label: withheldLabel(withheld, missing, input.execOff),
      })
    }
    if (report.tool !== undefined && !report.tool.found) {
      const binary = report.tool.binary
      out.push({ kind: 'binary', runner, binary, label: missingBinaryLabel(binary) })
    }
    const byReason = new Map<ParametersUnknownReason, string[]>()
    for (const task of report.tasks) {
      if (task.parametersUnknown === undefined) continue
      const ids = byReason.get(task.parametersUnknown) ?? []
      ids.push(task.id)
      byReason.set(task.parametersUnknown, ids)
    }
    for (const [reason, tasks] of byReason) {
      out.push({ kind: 'parameters', runner, reason, tasks, label: parametersUnknownLabel(reason) })
    }
    const state = input.cache?.find((c) => c.runner === runner)
    if (state?.state === 'stale') {
      out.push({
        kind: 'stale',
        runner,
        ...(state.reason !== undefined ? { reason: state.reason } : {}),
        ...(state.ageMs !== undefined ? { ageMs: state.ageMs } : {}),
        label: staleLabel(state.reason, state.ageMs),
      })
    }
  }
  return out
}

/**
 * What turned execution off for a gate that is not `untrusted`: a config
 * file's `allowExec: false`, else the `--no-exec` flag.
 */
export function execOffSource(settings: Pick<Settings, 'allowExec'>): ExecOffSource {
  const { value, source } = settings.allowExec
  return value === false && (source === 'user' || source === 'project') ? source : 'flag'
}

/**
 * One line of text for an unknown: the runner's name and the label, and for
 * parameters how many tasks. The same line on every text surface.
 */
export function unknownLine(unknown: Unknown): string {
  const count = unknown.kind === 'parameters' ? ` (${countTasks(unknown.tasks.length)})` : ''
  return `${runnerLabel(unknown.runner)}: ${unknown.label}${count}`
}

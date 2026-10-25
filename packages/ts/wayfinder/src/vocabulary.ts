/**
 * The words every surface shows a person: the noun for a row, the name of a
 * runner or group, and the one label for each thing wayfinder cannot know.
 * The CLI, the terminal UI, the web view and the JSON documents take their
 * wording from here, so a change happens in one place.
 *
 * Browser-safe: no Node built-in, so the page imports it.
 */

import { groupOf } from '@osdlc/system-model/groups'
import { humanAge, humanMs } from '@osdlc/system-model/duration'
import type { ParametersUnknownReason } from '@osdlc/system-model/detect'
import type { StaleReason } from '@osdlc/system-model/detect'

export { APP, BIN } from './app.ts'

/** What one row is called on every surface. */
export const TASK_NOUN = { one: 'task', many: 'tasks' } as const

/** `1 task`, `3 tasks`. */
export function countTasks(n: number): string {
  return `${n} ${n === 1 ? TASK_NOUN.one : TASK_NOUN.many}`
}

/** `1 runner`, `3 runners`. */
export function countRunners(n: number): string {
  return `${n} runner${n === 1 ? '' : 's'}`
}

/**
 * The name a person reads for a runner: the group's name for a synthesized
 * group (`dependencies`, `tools`, `git hooks`), else the runner id. JSON and
 * config keys keep the id.
 */
export function runnerLabel(runner: string): string {
  const group = groupOf(runner)
  return group.runner === runner ? group.title.toLowerCase() : runner
}

/** The word for a runner that was not read because reading it means running it. */
export const WITHHELD = 'withheld'

/**
 * Why a runner was withheld: the repository is not trusted, or execution is
 * off by a flag or a config file.
 */
export type WithheldReason = 'untrusted' | 'exec-off'

const WITHHELD_REASONS: Record<WithheldReason, string> = {
  untrusted: 'this repository is not trusted',
  'exec-off': 'execution is off',
}

/** `withheld: this repository is not trusted`. */
export function withheldLabel(reason: WithheldReason): string {
  return `${WITHHELD}: ${WITHHELD_REASONS[reason]}`
}

const PARAMETERS_UNKNOWN: Record<ParametersUnknownReason, string> = {
  'exec-withheld': 'reading them needs execution, which is withheld',
  'tool-missing': 'the tool is not installed',
  'tool-failed': 'the tool could not list them',
  'not-read': 'this runner does not read them',
  'editor-variable': 'the task uses an editor variable, so it cannot run here',
}

/** The label for a task whose parameters could not be read. */
export function parametersUnknownLabel(reason: ParametersUnknownReason): string {
  return `parameters unknown: ${PARAMETERS_UNKNOWN[reason]}`
}

const STALE_REASONS: Record<StaleReason, string> = {
  changed: 'its files changed',
  'max-age': 'it is past its age limit',
  excludes: 'the excluded paths changed',
  exec: 'it was read with another execution setting',
  version: 'another version read it',
  tool: 'the tool changed',
}

/** `stale: its files changed, 3m old`. */
export function staleLabel(reason: StaleReason | undefined, ageMs: number | undefined): string {
  const why = reason === undefined ? '' : `${STALE_REASONS[reason]}, `
  return `stale: ${why}${humanAge(ageMs)}`
}

/** The label for a runner with nothing stored. */
export const NOT_CACHED = 'not cached'

/** `just is not installed`. */
export function missingBinaryLabel(binary: string): string {
  return `${binary} is not installed`
}

/** `probed in 1.2s`, for a runner read just now. */
export function probeTimeLabel(ms: number): string {
  return `probed in ${humanMs(ms)}`
}

/**
 * What a refresh of a runner usually costs, for a cache note: `refresh
 * usually about 2.0s`, or that nothing has been measured here yet.
 */
export function refreshCostLabel(estimateMs: number | null): string {
  return estimateMs === null
    ? 'refresh cost not measured here yet'
    : `refresh usually about ${humanMs(estimateMs)}`
}

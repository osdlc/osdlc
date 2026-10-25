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

/** How long a refresh runs before the status names the runners it still waits on. */
export const WAITING_AFTER_MS = 3000

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

/**
 * A task's path as a person reads it: a runner id at its head becomes the
 * runner's label, so `package-manager > . > npm > install` reads
 * `dependencies > . > npm > install`.
 */
export function displayPath(path: readonly string[], runner: string): string[] {
  return path[0] === runner ? [runnerLabel(runner), ...path.slice(1)] : [...path]
}

/** The word for a runner that was not read because reading it means running it. */
export const WITHHELD = 'withheld'

/**
 * Why a runner was withheld: the repository is not trusted, a tool the runner
 * runs has no trust grant while others in the repository have one, or
 * execution is off by a flag or a config file.
 */
export type WithheldReason = 'untrusted' | 'tool-untrusted' | 'exec-off'

const WITHHELD_REASONS: Record<WithheldReason, string> = {
  untrusted: 'this repository is not trusted',
  'tool-untrusted': 'a tool it runs is not trusted',
  'exec-off': 'execution is off',
}

/** `a`, `a and b`, `a, b and c`. */
function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/**
 * What turned execution off: the `--no-exec` flag, or `allowExec: false` in
 * the user or the project config.
 */
export type ExecOffSource = 'flag' | 'user' | 'project'

const EXEC_OFF: Record<ExecOffSource, string> = {
  flag: '--no-exec was given',
  user: 'allowExec is false in your user config',
  project: 'allowExec is false in this project',
}

/** Why execution is off, in words: `--no-exec was given`. */
export function execOffLabel(source: ExecOffSource | undefined): string {
  return source === undefined ? WITHHELD_REASONS['exec-off'] : EXEC_OFF[source]
}

/**
 * `withheld: this repository is not trusted`. For `tool-untrusted` with the
 * missing tool ids: `withheld: mise is not trusted`. For `exec-off` with what
 * turned it off: `withheld: --no-exec was given`.
 */
export function withheldLabel(
  reason: WithheldReason,
  missing: readonly string[] = [],
  execOff?: ExecOffSource,
): string {
  if (reason === 'tool-untrusted' && missing.length > 0) {
    return `${WITHHELD}: ${listWords(missing)} ${missing.length === 1 ? 'is' : 'are'} not trusted`
  }
  if (reason === 'exec-off') return `${WITHHELD}: ${execOffLabel(execOff)}`
  return `${WITHHELD}: ${WITHHELD_REASONS[reason]}`
}

/** What a tool with no single language reports as its language. */
export const ANY_LANGUAGE = 'any language'

const LANGUAGES: Record<string, string> = {
  node: 'JavaScript',
  deno: 'JavaScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  ruby: 'Ruby',
  php: 'PHP',
  jvm: 'Java',
  dotnet: '.NET',
  swift: 'Swift',
}

/**
 * The language a person reads for a tool's ecosystem id: `node` is
 * `JavaScript`. An id with no entry is shown as it is. No ecosystem is
 * {@link ANY_LANGUAGE}: make, just and moon serve every language.
 */
export function languageLabel(ecosystem: string | null | undefined): string {
  if (ecosystem === null || ecosystem === undefined) return ANY_LANGUAGE
  return LANGUAGES[ecosystem] ?? ecosystem
}

/** What the Skills group's rows are called. */
export const SKILL_NOUN = { one: 'skill', many: 'skills' } as const

/** `1 skill`, `3 skills`. */
export function countSkills(n: number): string {
  return `${n} ${n === 1 ? SKILL_NOUN.one : SKILL_NOUN.many}`
}

const PARAMETERS_UNKNOWN: Record<Exclude<ParametersUnknownReason, 'editor-variable'>, string> = {
  'exec-withheld': 'reading them needs execution, which is withheld',
  'tool-missing': 'the tool is not installed',
  'tool-failed': 'the tool could not list them',
  'not-read': 'this runner does not read them',
}

/** The label for a task that uses an editor variable: it cannot run outside the editor. */
export const EDITOR_VARIABLE_LABEL = 'cannot run here: the task uses an editor variable'

/**
 * The label for a task whose parameters could not be read. An editor
 * variable is not a gap in what is known: the task cannot run here at all,
 * and the label says that ({@link EDITOR_VARIABLE_LABEL}).
 */
export function parametersUnknownLabel(reason: ParametersUnknownReason): string {
  return reason === 'editor-variable'
    ? EDITOR_VARIABLE_LABEL
    : `parameters unknown: ${PARAMETERS_UNKNOWN[reason]}`
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

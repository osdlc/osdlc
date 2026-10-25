/**
 * The task model every runner produces, and the evidence every detection
 * carries.
 *
 * Vocabulary:
 *
 *   Runner  a tool that runs things: moon, just, cargo, make.
 *   Task    one runnable command a runner exposes: `moon run web:dev`.
 */

import { EVIDENCE_TIERS, type Evidence, type EvidenceKind } from './aspect.ts'

/**
 * A task parameter, as data rather than as text in a command line.
 *
 * This is why `argv` and `display` are separate fields. just shows
 * parameters as `<required>`, `[optional]` and `*variadic`. In a shell
 * string, `<lib>` is an input redirection and `*flags` is a glob.
 */
export interface Param {
  name: string
  required: boolean
  variadic: boolean
  /** Literal default where the runner declares one. */
  default?: string | undefined
  /** How a value reaches the command. Absent means `positional`. */
  binding?: ParamBinding | undefined
  /** What the parameter is for, where the runner says. */
  doc?: string | undefined
  /** The only values the runner accepts, where it declares a list. */
  choices?: string[] | undefined
}

/**
 * How a parameter's value reaches the command:
 *
 *   - `positional`: an argument, in parameter order, bound by the runner's
 *     own rule (`just deploy prod`, `rake 'release[1.2]'`).
 *   - `flag`: `flag value` (`--env prod`). With `key`, the value is passed as
 *     `key=value` (`gh workflow run x.yml -f env=prod`).
 *   - `assign`: one `name=value` argument, `name` defaulting to the
 *     parameter's (`make deploy ENV=prod`, `task deploy ENV=prod`).
 *   - `env`: the environment variable `name`.
 */
export type ParamBinding =
  | { kind: 'positional' }
  | { kind: 'flag'; flag: string; key?: string | undefined }
  | { kind: 'assign'; name?: string | undefined }
  | { kind: 'env'; name: string }

/** Values for a task's parameters, by parameter name. A variadic takes a list. */
export type ParamValues = Readonly<Record<string, string | readonly string[]>>

/** What runs a task: its argv and the environment variables to add. */
export interface Invocation {
  argv: string[]
  env: Record<string, string>
}

/**
 * Why a task's parameters are not known. `parameters` is then empty, but the
 * task may still take arguments:
 *
 *   - `exec-withheld`: only the tool can list them, and execution was not
 *     allowed (a just recipe scanned from source).
 *   - `tool-missing`: execution was allowed, but the tool is not on the PATH.
 *   - `tool-failed`: the tool ran and gave no usable answer.
 *   - `not-read`: the file declares them, and this runner does not read them
 *     (GitHub Actions dispatch inputs).
 */
export type ParametersUnknownReason = 'exec-withheld' | 'tool-missing' | 'tool-failed' | 'not-read'

/**
 * Where a task came from: declared in a file, or synthesized from a
 * convention (`cargo test` for a crate, `pnpm install` for a lockfile).
 */
export type TaskOrigin = 'declared' | 'synthesized'

/**
 * Where a task's command runs. This is separate from how the task was found.
 * A GitHub Actions workflow is read from a file but runs `remote`. A compose
 * service runs in a `container`.
 */
export type TaskExecutionTarget = 'local' | 'remote' | 'container'

/**
 * One runnable command.
 *
 * `argv` is what you execute. `display` is what you show. Never build one
 * from the other. To add arguments, use `Project.runners.invoke`.
 */
export interface Task {
  /** Stable across a re-collect: runner, declaring file and name. */
  id: string
  /** The runner that owns it: the tool id, or a synthesized role group. */
  runner: string
  /** Display and search chain, root first, with `runner` at index 0. */
  path: string[]
  /** Executable form. Spawn it directly, never through a shell. No placeholders. */
  argv: string[]
  /**
   * Directory the command expects, relative to the profile root. `.` unless
   * the tool has no flag to name a directory.
   */
  cwd: string
  /** Human form for showing and copying. May hold parameter placeholders. */
  display: string
  /** The parameters, in order. Empty when there are none or when they are unknown. */
  parameters: Param[]
  /**
   * Set when the parameters could not be read, so an empty `parameters` does
   * not mean "takes none". Absent when `parameters` is the full list.
   */
  parametersUnknown?: ParametersUnknownReason | undefined
  /** File that declares it, relative to the profile root. */
  source: string
  origin: TaskOrigin
  /** Summary where the runner supplies one. */
  doc?: string | undefined
  /** What the task executes, when that differs from `display`. */
  detail?: string | undefined
  /**
   * Ids of tasks in the same report that run before this one, in declared
   * order. Absent when there are none or the runner does not read them.
   */
  dependsOn?: string[] | undefined
  /**
   * Dependencies that name no task in the report, as written: a turbo
   * `^build`, a moon `^:build`, a task an include declares.
   */
  dependsOnUnresolved?: string[] | undefined
  /** Free-text facets for search and filtering. */
  tags: string[]
  /**
   * Whether this keeps running until stopped (a dev server, a watcher).
   * `declared` is true when the runner said so, false when it is guessed
   * from the name.
   */
  persistent: { value: boolean; declared: boolean }
  executes: TaskExecutionTarget
}

/**
 * What one position in a runner's `Task.path` selects.
 */
export interface ChainSegment {
  /** One-word column name: "project", "recipe", "script". */
  label: string
  /** A sentence explaining what that position selects. */
  hint: string
}

/** Build one {@link Evidence} with its tier filled in. */
export function evidence(kind: EvidenceKind, source: string, found: string): Evidence {
  return { kind, tier: EVIDENCE_TIERS[kind], source, found }
}

/** How serious a diagnostic is. */
export type Severity = 'info' | 'warning' | 'error'

/**
 * Something the caller should know that is not a task: "just is not
 * installed", "this justfile is broken".
 */
export interface Diagnostic {
  severity: Severity
  message: string
  /** File the diagnostic is about, relative to the profile root. */
  source?: string | undefined
}

/**
 * A runner's icon and colour, for views that show more than text. Kept on
 * the report rather than on each task.
 */
export interface RunnerBrand {
  /** Inline SVG markup, viewBox only, `currentColor` where monochrome. */
  icon?: string | undefined
  /** `#rrggbb`. */
  color?: string | undefined
}

/**
 * What a runner's `collect` returns. `absent` is a value, not an error: the
 * tool was detected but has nothing to run.
 */
export interface ProviderResult {
  status: 'absent' | 'ok' | 'error'
  tasks: Task[]
  diagnostics: Diagnostic[]
}

/**
 * One runner's slice of a catalog.
 */
export interface RunnerReport extends ProviderResult {
  runner: string
  chain: ChainSegment[]
  brand?: RunnerBrand | undefined
  /**
   * Whether the tool's binary is on the PATH, filled by `collect` with a PATH
   * lookup, never by the runner itself. Absent when the tool declares no
   * binary.
   */
  tool?: { binary: string; found: boolean; path?: string } | undefined
  /** True when the runner was withheld because it must run a subprocess. */
  skippedForExec: boolean
}

/**
 * How file discovery resolved: `git ls-files` or a directory walk.
 */
export type DiscoveryMode = 'git' | 'walk'

/**
 * Every runner report for one profile.
 */
export interface Catalog {
  /** Absolute path. Every `cwd` and `source` is relative to it. */
  root: string
  generatedAt: string
  discovery: DiscoveryMode
  /** Whether runners were allowed to run subprocesses. */
  allowExec: boolean
  reports: RunnerReport[]
}

/** Every task in a catalog, across runners, in report order. */
export function tasks(catalog: Catalog): Task[] {
  return catalog.reports.flatMap((r) => r.tasks)
}

/** Every diagnostic in a catalog, tagged with the runner that raised it. */
export function diagnostics(catalog: Catalog): Array<Diagnostic & { runner: string }> {
  return catalog.reports.flatMap((r) => r.diagnostics.map((d) => ({ ...d, runner: r.runner })))
}

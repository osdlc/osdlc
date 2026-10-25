/**
 * Helpers the built-in plugins share, so the heuristics do not drift apart
 * per runner.
 */

import type { Task } from '../../model.ts'
import { dirOf } from '../../pattern.ts'
import type { Package } from '../../tool.ts'

export { dirOf, joinRel } from '../../pattern.ts'

/**
 * Names that start something you then look at or interact with.
 *
 * The exclusion list matters as much as the match: `storybook-build` and
 * `dev-check` both start with a runnable word and are neither. This is a
 * guess. `Task.persistent.declared` records whether the runner itself said
 * so, so a consumer that wants only stated answers can ignore this function.
 */
const RUNNABLE_NAME = /^(dev|web|serve|start|run|preview|watch|tauri|storybook)\b/
const NOT_RUNNABLE_NAME = /\b(build|check|test|lint|fmt|format|typecheck|generate|clean)\b/

export function looksPersistent(name: string): boolean {
  return RUNNABLE_NAME.test(name) && !NOT_RUNNABLE_NAME.test(name)
}

/**
 * A task's stable identity: runner, declaring file, and name.
 *
 * Stable across a re-collect, so a UI keeps its selection through a refresh
 * and callers can hold an id instead of an index into a list that will be
 * rebuilt. Includes `source` because the same recipe name can appear in
 * several justfiles.
 */
export function taskId(runner: string, source: string, name: string): string {
  return `${runner}:${source}:${name}`
}

/**
 * The grouping tier of a source path: its parent directory.
 *
 * This keeps a large monorepo readable: `solutions/determined/apps` puts those
 * apps under one heading instead of ninety-five names in a flat list. The root
 * groups under ".".
 *
 * Only a `./` prefix is stripped, never a bare leading dot: `.github/actions/x`
 * is a real directory and must group under `.github/actions`.
 */
export function tierOf(source: string): string {
  const norm = source.replace(/^\.\//, '')
  if (norm === '' || norm === '.') return '.'
  const at = norm.lastIndexOf('/')
  return at === -1 ? '.' : norm.slice(0, at)
}

/**
 * `dependsOn` and `dependsOnUnresolved` for a task that names `deps`, each
 * looked up by `resolve`. Either field is left out when empty.
 */
export function dependencies(
  deps: readonly string[],
  resolve: (name: string) => string | undefined,
): Pick<Task, 'dependsOn' | 'dependsOnUnresolved'> {
  const ids: string[] = []
  const unresolved: string[] = []
  for (const dep of deps) {
    const id = resolve(dep)
    if (id === undefined) {
      if (!unresolved.includes(dep)) unresolved.push(dep)
    } else if (!ids.includes(id)) ids.push(id)
  }
  return {
    ...(ids.length > 0 ? { dependsOn: ids } : {}),
    ...(unresolved.length > 0 ? { dependsOnUnresolved: unresolved } : {}),
  }
}

/**
 * {@link dependencies} for names that resolve to tasks of `runner` declared
 * in the same `file`, when `names` holds them.
 */
export function dependenciesIn(
  runner: string,
  file: string,
  deps: readonly string[],
  names: ReadonlySet<string>,
): Pick<Task, 'dependsOn' | 'dependsOnUnresolved'> {
  return dependencies(deps, (dep) => (names.has(dep) ? taskId(runner, file, dep) : undefined))
}

/** Bind arguments after a `--`, for tools that read their own flags up to it. */
export function afterSeparator(task: Task, args: readonly string[]): string[] {
  return args.length === 0 ? [...task.argv] : [...task.argv, '--', ...args]
}

/** `text` without a leading byte-order mark. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** A key/value table, not an array or null. */
export function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Byte-wise key order, the order dependency lists are compared in. */
export function compareUtf8(a: string, b: string): number {
  return Buffer.from(a, 'utf8').compare(Buffer.from(b, 'utf8'))
}

export function sortedEntries(table: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(table).sort(([a], [b]) => compareUtf8(a, b))
}

/**
 * The files that showed `tool` in these packages, sorted. With `names`, only
 * those whose basename is one of them.
 */
export function sourcesOf(
  packages: readonly Package[],
  tool: string,
  names?: readonly string[],
): string[] {
  const out = new Set<string>()
  for (const pkg of packages) {
    for (const ev of pkg.tools.find((t) => t.tool === tool)?.evidence ?? []) {
      const path = ev.source.split('#')[0]!
      if (names === undefined || names.includes(path.split('/').pop()!)) out.add(path)
    }
  }
  return [...out].sort()
}

/** One file per directory: the last of `files` in sorted order. */
export function onePerDir(files: readonly string[]): string[] {
  const byDir = new Map<string, string>()
  for (const file of [...files].sort()) byDir.set(dirOf(file), file)
  return [...byDir.values()].sort()
}

/** `argv` with `flag dir` straight after the binary: `pnpm --dir apps/web install`. */
export function flagAfterBinary(flag: string): (argv: readonly string[], dir: string) => string[] {
  return ([binary, ...rest], dir) => [binary!, flag, dir, ...rest]
}

/** `argv` with `flag value` at the end: `uv sync --project py`. */
export function flagAtEnd(
  flag: string,
  value: (dir: string) => string = (dir) => dir,
): (argv: readonly string[], dir: string) => string[] {
  return (argv, dir) => [...argv, flag, value(dir)]
}

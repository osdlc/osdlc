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
 * The negative half matters as much as the positive: `storybook-build` and
 * `dev-check` both open with a runnable word and are neither. This is a GUESS —
 * `Task.persistent.declared` records whether the runner said so itself, so a
 * consumer that wants only authoritative answers can ignore this function's
 * output entirely.
 */
const RUNNABLE_NAME = /^(dev|web|serve|start|run|preview|watch|tauri|storybook)\b/
const NOT_RUNNABLE_NAME = /\b(build|check|test|lint|fmt|format|typecheck|generate|clean)\b/

export function looksPersistent(name: string): boolean {
  return RUNNABLE_NAME.test(name) && !NOT_RUNNABLE_NAME.test(name)
}

/**
 * A task's stable identity: runner, declaring file, and name.
 *
 * Stable across a re-collect so a UI keeps its selection through a refresh, and
 * so callers hold a reference rather than an index into a list that is about to
 * be rebuilt. Includes `source` because the same recipe name legitimately
 * appears in several justfiles.
 */
export function taskId(runner: string, source: string, name: string): string {
  return `${runner}:${source}:${name}`
}

/**
 * The grouping tier a source path belongs to — its parent directory.
 *
 * What makes a large monorepo scannable: `solutions/determined/apps` collects
 * that fleet under one heading instead of ninety-five names in a flat list.
 * The root itself groups under ".".
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

/** Bind arguments after a `--`, for tools that read their own flags up to it. */
export function afterSeparator(task: Task, args: readonly string[]): string[] {
  return args.length === 0 ? [...task.argv] : [...task.argv, '--', ...args]
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

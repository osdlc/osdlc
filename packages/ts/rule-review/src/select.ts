/**
 * Scope selection: which entries does a changeset touch?
 *
 * Pure. Shared by rule-source planning and script-check selection so both use
 * one matcher.
 */
import { compile, index, IntersectError, matches, type Options } from '@osdlc/intersect'

/** One thing to select for: an id and the path patterns that scope it. */
export interface ScopeEntry {
  id: string
  patterns: readonly string[]
}

/** What `selectByScope` returns: files per matched entry, and the entries that matched none. */
export interface ScopeSelection {
  /** Matched entry id to its in-scope files, in changeset order. */
  covered: Map<string, string[]>
  /** Ids of entries that matched no file, in entry order. */
  unmatched: string[]
}

/** A scope or exclude pattern the matcher cannot read, such as `{1..3}` or an extglob. */
export class ScopeError extends Error {
  override readonly name = 'ScopeError'
}

/** `*` and `**` match dotfiles and dot-directories too, so `**` means every file. */
const MATCH_OPTIONS: Options = { dot: true }

/** Escape glob syntax so a literal path, such as a directory named `[id]`, matches as itself. */
export function escapeGlob(path: string): string {
  return path.replace(/[\\*?[\]{}()]/g, '\\$&')
}

/**
 * Pair every entry with the changed files its patterns match.
 *
 * @param entries - Ids must be unique; the intersect registry rejects duplicates.
 * @param changedFiles - Repo-relative paths in the changeset.
 * @param exclude - Patterns that remove files from the changeset first.
 * @throws {ScopeError} A pattern uses syntax `@osdlc/intersect` rejects; the message names it.
 */
export function selectByScope(
  entries: readonly ScopeEntry[],
  changedFiles: readonly string[],
  exclude: readonly string[],
): ScopeSelection {
  assertReadable('exclude', exclude)
  for (const e of entries) assertReadable(`scope of '${e.id}'`, e.patterns)

  const files =
    exclude.length === 0
      ? [...changedFiles]
      : changedFiles.filter((f) => !matches(f, [...exclude], MATCH_OPTIONS))

  const registry = index(
    entries.map((e) => ({ id: e.id, patterns: [...e.patterns] })),
    MATCH_OPTIONS,
  )

  // The registry answers "which entries cover this path", so query per file and invert.
  const covered = new Map<string, string[]>()
  for (const file of files) {
    for (const id of registry.matching(file)) {
      const group = covered.get(id)
      if (group === undefined) covered.set(id, [file])
      else group.push(file)
    }
  }

  const unmatched = entries.filter((e) => !covered.has(e.id)).map((e) => e.id)
  return { covered, unmatched }
}

/** Compile `patterns` once so a bad one fails here, named, not deep inside the registry. */
function assertReadable(what: string, patterns: readonly string[]): void {
  try {
    compile([...patterns], MATCH_OPTIONS)
  } catch (err) {
    if (err instanceof IntersectError)
      throw new ScopeError(`${what}: ${err.message}`, { cause: err })
    throw err
  }
}

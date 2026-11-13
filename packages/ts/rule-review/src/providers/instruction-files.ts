/**
 * The built-in provider: `CLAUDE.md` and `AGENTS.md` as rule sources, each
 * governing `<dir>/**`. `@path` imports are inlined the way Claude Code reads
 * them, and a sibling whose rules another already carries is not judged twice.
 * Design: docs/planning/decisions/D-04-one-built-in-provider.md.
 */
import { basename, dirname, relative, resolve } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { nodeGuard, readContainedFile } from '@osdlc/path-guard/node'

import { escapeGlob } from '../select.ts'
import type { DiscoveryContext, RuleSource, RuleSourceProvider } from '../types.ts'

/** The `kind` of every rule source this provider makes. */
export const INSTRUCTION_KIND = 'instruction'

const FILENAMES = ['CLAUDE.md', 'AGENTS.md'] as const

/**
 * git pathspecs for those names at any depth. `*` also matches inside a file
 * name (`SUBAGENTS.md`), so results are filtered by exact basename too.
 */
const PATHSPECS = FILENAMES.map((name) => `*${name}`)

/**
 * Claude Code's import syntax: `@` followed by a path with an extension. The
 * `@` must not follow a word character, so an email address such as
 * `user@example.com` is not read as an import of `example.com`.
 */
const IMPORT_RE = /(?<![\w.@])@((?:\.{1,2}\/)?[\w.\-/]+\.\w+)/g

/** Enumerates candidate instruction-file paths, repo-relative. */
export type FileLister = (projectRoot: string) => Promise<string[]> | string[]

/**
 * Ask git, not the filesystem.
 *
 * A tree walk is the obvious implementation and the wrong one: globbing
 * `**\/CLAUDE.md` across a monorepo stats every build output and dependency
 * tree, which on a large repo does not finish in any useful time. git answers
 * the same question from its index in milliseconds and skips everything
 * .gitignore already excludes. Untracked files are included so a
 * newly-written instruction file governs the change that adds it.
 */
export const gitFileLister: FileLister = (projectRoot) => {
  const git = new Git(projectRoot)
  return [
    ...git.lsFiles({ paths: [...PATHSPECS] }),
    ...git.lsFiles({ others: true, excludeStandard: true, paths: [...PATHSPECS] }),
  ].filter(isInstructionFile)
}

/** True when `path`'s file name is exactly one of the instruction file names. */
function isInstructionFile(path: string): boolean {
  return (FILENAMES as readonly string[]).includes(basename(path))
}

/** True when a file in `dir` (repo-relative, `.` for the root) governs `file`. */
function governs(dir: string, file: string): boolean {
  return dir === '.' || dir === '' || file.startsWith(`${dir}/`)
}

/** Options for {@link instructionFiles}. */
export interface InstructionFilesOptions {
  /**
   * How candidate paths are found. Defaults to the tracked and untracked
   * (not ignored) files git lists; supply your own for a project that is not a
   * git repository.
   */
  list?: FileLister
  /**
   * How many levels of `@path` import to follow; 0 disables resolution.
   * Defaults to 2.
   */
  maxImportDepth?: number
}

/**
 * Discover `CLAUDE.md`/`AGENTS.md` beneath the project root. A file or import
 * whose real path leaves the project root is skipped without error. When the
 * context lists changed files, a file whose directory holds none of them is
 * not read: it would be planned away.
 */
export function instructionFiles(options: InstructionFilesOptions = {}): RuleSourceProvider {
  const list = options.list ?? gitFileLister
  const maxImportDepth = options.maxImportDepth ?? 2

  return {
    id: 'instruction-files',
    async discover(ctx: DiscoveryContext): Promise<RuleSource[]> {
      const changed = ctx.changedFiles
      const paths = [...new Set(await list(ctx.projectRoot))]
        .filter((p) => changed.length === 0 || changed.some((f) => governs(dirname(p), f)))
        .sort()

      const realRoot = nodeGuard.realPath(resolve(ctx.projectRoot))
      const read = await Promise.all(
        paths.map(async (relPath) => {
          const real = relative(realRoot, nodeGuard.realPath(resolve(realRoot, relPath)))
          const { text, inlined } = await readWithImports(realRoot, relPath, maxImportDepth)
          return { relPath, real, text, inlined }
        }),
      )
      const found: Found[] = read
        .filter((r) => r.text.trim() !== '')
        .map((r) => ({
          source: toSource(r.relPath, r.text),
          real: r.real,
          covers: new Set([r.real, ...r.inlined]),
        }))
      return found.filter((f, i) => !redundant(f, i, found)).map((f) => f.source)
    },
  }
}

/** A discovered source, the real path it was read from, and every file its text holds. */
interface Found {
  source: RuleSource
  real: string
  /** Repo-relative real paths: the file itself and each import inlined into it. */
  covers: ReadonlySet<string>
}

/**
 * True when a sibling in the same directory already carries all of `f`'s
 * rules, so keeping both would judge every file twice with the same rules.
 *
 * Decided by file identity, not by comparing prose: `f` is redundant when a
 * sibling's text holds every file `f`'s text holds. That covers a sibling read
 * from the same real file (a `CLAUDE.md` symlinked to `AGENTS.md`; the first by
 * path stays) and a sibling that imports `f` (a `CLAUDE.md` whose body is
 * `@AGENTS.md`). A sibling that only happens to contain the same words is not
 * redundant.
 */
function redundant(f: Found, index: number, found: readonly Found[]): boolean {
  const dir = dirname(f.source.path)
  const within = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
    [...a].every((x) => b.has(x))
  return found.some(
    (other, j) =>
      j !== index &&
      dirname(other.source.path) === dir &&
      within(f.covers, other.covers) &&
      // Two siblings that hold the same files: keep the first.
      (!within(other.covers, f.covers) || j < index),
  )
}

function toSource(relPath: string, text: string): RuleSource {
  const dir = dirname(relPath)
  const atRoot = dir === '.' || dir === ''
  const segments = atRoot ? [] : dir.split('/')
  return {
    id: `instruction:${relPath}`,
    kind: INSTRUCTION_KIND,
    path: relPath,
    depth: segments.length,
    patterns: [atRoot ? '**' : `${escapeGlob(dir)}/**`],
    text,
    label: `${relPath.split('/').pop()} (${atRoot ? 'repo root' : dir})`,
  }
}

/**
 * Read an instruction file, inlining each `@path` import once, and list the
 * files inlined (repo-relative real paths).
 *
 * Each file has an import budget: the root has `maxDepth`, and an import has
 * one less than the file that reached it with the most. A sibling instruction
 * file (`CLAUDE.md` importing `@AGENTS.md`) starts again at `maxDepth`, so it
 * is inlined whole, as it reads on its own. A file is inlined once, under the
 * file that gave it its best budget, so the result does not depend on import
 * order.
 *
 * Each import is preceded by `<!-- imported from <path> -->` so the judge can
 * tell borrowed prose from the file's own.
 */
async function readWithImports(
  realRoot: string,
  relPath: string,
  maxDepth: number,
): Promise<{ text: string; inlined: string[] }> {
  const dir = dirname(relPath)
  const isSiblingInstructionFile = (target: string): boolean =>
    target !== relPath && dirname(target) === dir && isInstructionFile(target)
  const budget = new Map<string, number>([[relPath, maxDepth]])
  const parent = new Map<string, string>()
  const texts = new Map<string, string | null>()
  const targetsOf = new Map<string, string[]>()
  let queue = [relPath]
  while (queue.length > 0) {
    const next: string[] = []
    for (const path of queue) {
      if (!texts.has(path)) texts.set(path, await readText(realRoot, path))
      const text = texts.get(path)
      const left = budget.get(path) ?? 0
      if (text === null || text === undefined || left <= 0) continue
      const targets = importTargets(realRoot, path, text)
      targetsOf.set(path, targets)
      for (const target of targets) {
        const offered = isSiblingInstructionFile(target) ? maxDepth : left - 1
        if (offered <= (budget.get(target) ?? -1)) continue
        budget.set(target, offered)
        parent.set(target, path)
        next.push(target)
      }
    }
    queue = next
  }

  const inlined = new Set<string>()
  const render = (path: string): string => {
    inlined.add(path)
    const text = texts.get(path) ?? ''
    const imported: string[] = []
    for (const target of targetsOf.get(path) ?? []) {
      if (inlined.has(target) || parent.get(target) !== path) continue
      const body = render(target)
      if (body.trim() === '') continue
      imported.push(`\n\n<!-- imported from ${target} -->\n${body}`)
    }
    return imported.length === 0 ? text : text + imported.join('')
  }
  const text = render(relPath)
  inlined.delete(relPath)
  return { text, inlined: [...inlined].filter((p) => (texts.get(p) ?? '').trim() !== '') }
}

/** A contained file's text, or null when it is missing, unreadable or outside the root. */
async function readText(realRoot: string, relPath: string): Promise<string | null> {
  try {
    const bytes = await readContainedFile(realRoot, resolve(realRoot, relPath))
    return bytes === null ? null : bytes.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Repo-relative targets of the `@path` imports that stay inside the project
 * root, deduped, in document order: an import never pulls a host file into a
 * prompt. Each target is compared by real path, so an absolute import spelled
 * through a non-real root still counts as inside.
 */
function importTargets(realRoot: string, relPath: string, text: string): string[] {
  const baseDir = dirname(resolve(realRoot, relPath))
  const out: string[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(IMPORT_RE)) {
    const raw = match[1]
    if (raw === undefined) continue
    const abs = nodeGuard.realPath(resolve(baseDir, raw))
    const rel = relative(realRoot, abs)
    if (!nodeGuard.contains(realRoot, abs)) continue
    if (seen.has(rel)) continue
    seen.add(rel)
    out.push(rel)
  }
  return out
}

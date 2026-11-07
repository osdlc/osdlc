/**
 * The built-in provider: `CLAUDE.md` and `AGENTS.md` as scoped rule sources.
 *
 * An instruction file governs its own directory and everything under it, so
 * its scope is `<dir>/**` — the one place this package hard-codes a scoping
 * convention, because that convention is what an instruction file *is*.
 *
 * Pointer files are resolved. Several instruction files carry no rules of
 * their own and exist only to redirect (`See @./README.md`); dispatching one
 * verbatim spends a model call on a file that says nothing, so `@path`
 * imports are inlined the way Claude Code itself reads them, and a sibling
 * instruction file whose rules are already inlined (or symlinked) is not
 * dispatched a second time.
 */
import { dirname, relative, resolve } from 'node:path'

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
 * Claude Code's import syntax: `@` followed by a path with an extension.
 *
 * Deliberately does NOT match `[[wikilinks]]`. Those are cross-references
 * between documents, not imports — following them would pull an entire docs
 * tree into a single prompt, which is a different feature with a different
 * cost profile.
 */
const IMPORT_RE = /@((?:\.{1,2}\/)?[\w.\-/]+\.\w+)/g

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
    ...git.lsFiles({ others: true, excludeStandard: true }),
  ].filter((p) => (FILENAMES as readonly string[]).includes(p.split('/').pop() ?? ''))
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
   * How many levels of `@path` import to follow. 0 disables resolution.
   * Bounded because an import chain is user-authored and may cycle.
   * Defaults to 2.
   */
  maxImportDepth?: number
}

/**
 * Discover `CLAUDE.md`/`AGENTS.md` beneath the project root. A file or import
 * whose real path leaves the project root is skipped without error.
 */
export function instructionFiles(options: InstructionFilesOptions = {}): RuleSourceProvider {
  const list = options.list ?? gitFileLister
  const maxImportDepth = options.maxImportDepth ?? 2

  return {
    id: 'instruction-files',
    async discover(ctx: DiscoveryContext): Promise<RuleSource[]> {
      const paths = [...new Set(await list(ctx.projectRoot))].sort()

      const realRoot = nodeGuard.realPath(resolve(ctx.projectRoot))
      const found: Found[] = []
      for (const relPath of paths) {
        const text = await readWithImports(realRoot, relPath, maxImportDepth)
        if (text.trim() === '') continue
        const real = relative(realRoot, nodeGuard.realPath(resolve(realRoot, relPath)))
        found.push({ source: toSource(relPath, text), real })
      }
      return found.filter((f, i) => !redundant(f, i, found)).map((f) => f.source)
    },
  }
}

/** A discovered source and the repo-relative real path of the file it was read from. */
interface Found {
  source: RuleSource
  real: string
}

/**
 * True when a sibling in the same directory already carries all of `f`'s
 * rules, so keeping both would judge every file twice with the same rules.
 *
 * Two cases, both decided by file identity rather than by comparing prose: a
 * sibling read from the same real file (a `CLAUDE.md` symlinked to
 * `AGENTS.md`; the first by path stays), and a sibling that inlines `f` whole
 * as one of its imports (a `CLAUDE.md` whose body is `@AGENTS.md`). A sibling
 * that only happens to contain the same words is not redundant.
 */
function redundant(f: Found, index: number, found: readonly Found[]): boolean {
  const dir = dirname(f.source.path)
  const asImport = `<!-- imported from ${f.real} -->\n${f.source.text}`
  return found.some(
    (other, j) =>
      j !== index &&
      dirname(other.source.path) === dir &&
      ((other.real === f.real && j < index) || other.source.text.includes(asImport)),
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
 * Read an instruction file, inlining each `@path` import once.
 *
 * Imports are first walked breadth-first to find each file's shallowest
 * depth, then inlined depth-first, each file at that depth only. A file first
 * met through a longer chain is therefore still expanded with the most budget
 * it can have, and the result does not depend on import order.
 *
 * Each import is fenced with its source path so the judge can tell borrowed
 * prose from the instruction file's own words, and cannot misattribute a rule.
 */
async function readWithImports(
  realRoot: string,
  relPath: string,
  maxDepth: number,
): Promise<string> {
  const depthOf = new Map<string, number>([[relPath, 0]])
  const texts = new Map<string, string>()
  const targetsOf = new Map<string, string[]>()
  let frontier = [relPath]
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: string[] = []
    for (const path of frontier) {
      const text = await readText(realRoot, path)
      if (text === null) continue
      texts.set(path, text)
      if (depth >= maxDepth) continue
      const targets = importTargets(realRoot, path, text)
      targetsOf.set(path, targets)
      for (const target of targets) {
        if (depthOf.has(target)) continue
        depthOf.set(target, depth + 1)
        next.push(target)
      }
    }
    frontier = next
  }

  const inlined = new Set<string>()
  const render = (path: string, depth: number): string => {
    inlined.add(path)
    const text = texts.get(path) ?? ''
    const imported: string[] = []
    for (const target of targetsOf.get(path) ?? []) {
      if (inlined.has(target) || depthOf.get(target) !== depth + 1) continue
      const body = render(target, depth + 1)
      if (body.trim() === '') continue
      imported.push(`\n\n<!-- imported from ${target} -->\n${body}`)
    }
    return imported.length === 0 ? text : text + imported.join('')
  }
  return render(relPath, 0)
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
 * root, deduped, in document order. An import is a convenience, not a way to
 * pull host files into a prompt. Each target is compared by real path, so an
 * absolute import spelled through a non-real root still counts as inside.
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

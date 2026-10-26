/**
 * Scan skill, command and agent folders, and instruction files, into report
 * entries. Names, frontmatter descriptions and argument hints only; a body only
 * when the caller set `readContents`.
 *
 * Runtime-agnostic: pure over the {@link ProviderContext}, or any
 * {@link ArtifactReader}.
 */

import { join } from 'node:path'

import type { ProviderContext } from '../contract.ts'
import { argumentHintOf, parseFrontmatter, splitFrontmatter } from '../frontmatter.ts'
import { isInside } from '../inside.ts'
import type { Scope } from '../locations.ts'
import type { Artifact, Instruction } from '../report.ts'
import type { Located } from './sources.ts'

/**
 * The reads the scanners make. A {@link ProviderContext} is one; `readPlugin`
 * passes its own over the file system, so both read a plugin the same way.
 */
export type ArtifactReader = Pick<
  ProviderContext,
  'readText' | 'listDir' | 'realpath' | 'readContents'
>

/** Where an artifact came from. */
export interface Provenance {
  scope: Scope
  /** `user`, `project`, or `plugin:<id>`. */
  origin: string
  managerOwned: boolean
}

/** Options shared by the scanners. */
interface ScanOptions {
  /**
   * A real path. A file whose real path is not inside it is not read or listed,
   * so a symbolic link cannot carry a file from outside it into the report.
   */
  within?: string | undefined
}

function artifactOf(
  ctx: ArtifactReader,
  path: string,
  fallbackName: string,
  from: Provenance,
  options: ScanOptions,
): Artifact | null {
  if (options.within !== undefined) {
    const real = ctx.realpath(path)
    if (real === null || !isInside(options.within, real)) return null
  }
  const read = ctx.readText(path)
  if (read.status !== 'parsed') return null
  const fm = parseFrontmatter(read.text) ?? {}
  const name =
    typeof fm['name'] === 'string' && fm['name'].trim() ? fm['name'].trim() : fallbackName
  const description = typeof fm['description'] === 'string' ? fm['description'].trim() : null
  return {
    name,
    description,
    argumentHint: argumentHintOf(fm),
    path,
    scope: from.scope,
    origin: from.origin,
    managerOwned: from.managerOwned,
    body: ctx.readContents ? splitFrontmatter(read.text)[1].replace(/^\n+/, '') : null,
  }
}

/** Every `<dir>/<name>/SKILL.md`, named by its frontmatter `name`, else the folder name. */
export function scanSkills(
  ctx: ArtifactReader,
  dir: string,
  from: Provenance,
  options: ScanOptions = {},
): Artifact[] {
  return ctx.listDir(dir).flatMap((e) => {
    if (!e.isDirectory) return []
    const a = artifactOf(ctx, join(dir, e.name, 'SKILL.md'), e.name, from, options)
    return a ? [a] : []
  })
}

/**
 * True the first time a folder is seen, by real path. A symbolic link back to a
 * folder already walked (`self -> .`, or two links that lead to each other) would
 * otherwise repeat its files, or never end.
 */
function firstVisit(ctx: ArtifactReader, seen: Set<string>, dir: string): boolean {
  const real = ctx.realpath(dir) ?? dir
  if (seen.has(real)) return false
  seen.add(real)
  return true
}

/**
 * Every `*.md` under `dir`, named by its frontmatter `name`, else the file name
 * without `.md`. With `recursive`, sub-folders are walked too (Claude Code
 * namespaces commands by sub-folder but invokes them by file name).
 */
export function scanMarkdown(
  ctx: ArtifactReader,
  dir: string,
  from: Provenance,
  options: ScanOptions & { recursive?: boolean; useFrontmatterName?: boolean } = {},
): Artifact[] {
  const out: Artifact[] = []
  const seen = new Set<string>()
  const walk = (d: string): void => {
    if (!firstVisit(ctx, seen, d)) return
    for (const e of ctx.listDir(d)) {
      const abs = join(d, e.name)
      if (e.isDirectory && options.recursive) walk(abs)
      else if (e.isFile && e.name.endsWith('.md')) {
        const fallback = e.name.slice(0, -'.md'.length)
        const a = artifactOf(ctx, abs, fallback, from, options)
        if (!a) continue
        out.push(options.useFrontmatterName === false ? { ...a, name: fallback } : a)
      }
    }
  }
  walk(dir)
  return out
}

/** What one plugin folder holds. */
export interface PluginArtifacts {
  skills: Artifact[]
  commands: Artifact[]
  agents: Artifact[]
}

/**
 * The skills, commands and agents of the plugin folder at `root`: every
 * `skills/<name>/SKILL.md`; every `commands/<name>/SKILL.md` and flat
 * `commands/<name>.md` (not recursive); every `agents/*.md`. Skills, folder
 * commands and agents are named by their frontmatter `name`, else the folder or
 * file name; a flat command by its file name. Of skills, or of commands, with
 * one name the first is kept (by folder name; a folder command before a flat
 * one), so names are unique and a folder wins over a flat file. A symbolic link
 * is followed only while its real path stays inside the real plugin root; an
 * entry that leads out is neither read nor listed. `detect()` and `readPlugin`
 * both read a plugin through here.
 */
export function scanPluginArtifacts(
  ctx: ArtifactReader,
  root: string,
  from: Provenance,
): PluginArtifacts {
  const within = { within: ctx.realpath(root) ?? root }
  const commands = firstByName([
    ...scanSkills(ctx, join(root, 'commands'), from, within),
    ...scanMarkdown(ctx, join(root, 'commands'), from, { ...within, useFrontmatterName: false }),
  ])
  return {
    skills: firstByName(scanSkills(ctx, join(root, 'skills'), from, within)),
    commands,
    agents: scanMarkdown(ctx, join(root, 'agents'), from, within),
  }
}

/** `artifacts` without any whose name an earlier one has. */
function firstByName(artifacts: Artifact[]): Artifact[] {
  const seen = new Set<string>()
  return artifacts.filter((a) => {
    if (seen.has(a.name)) return false
    seen.add(a.name)
    return true
  })
}

/** Instruction files at `locs`: a file location when it exists, a folder's `.md`/`.mdc` files. */
export function scanInstructions(ctx: ProviderContext, locs: readonly Located[]): Instruction[] {
  const out: Instruction[] = []
  const seen = new Set<string>()
  const walk = (d: string, scope: Scope): void => {
    if (!firstVisit(ctx, seen, d)) return
    for (const e of ctx.listDir(d)) {
      const abs = join(d, e.name)
      if (e.isDirectory) walk(abs, scope)
      else if (e.isFile && (e.name.endsWith('.md') || e.name.endsWith('.mdc'))) {
        out.push({ path: abs, scope })
      }
    }
  }
  for (const loc of locs) {
    if (loc.kind === 'dir') walk(loc.resolved, loc.scope)
    else if (ctx.exists(loc.resolved) && !ctx.isDirectory(loc.resolved)) {
      out.push({ path: loc.resolved, scope: loc.scope })
    }
  }
  return out
}

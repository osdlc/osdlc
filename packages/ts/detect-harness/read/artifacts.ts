/**
 * Scan skill, command and agent folders, and instruction files, into report
 * entries. Names and frontmatter descriptions only; a body only when the caller
 * set `readContents`.
 *
 * Runtime-agnostic: pure over the {@link ProviderContext}.
 */

import { join } from 'node:path'

import type { ProviderContext } from '../contract.ts'
import { parseFrontmatter, splitFrontmatter } from '../frontmatter.ts'
import type { Scope } from '../locations.ts'
import type { Artifact, Instruction } from '../report.ts'
import type { Located } from './sources.ts'

/** Where an artifact came from. */
export interface Provenance {
  scope: Scope
  /** `user`, `project`, or `plugin:<id>`. */
  origin: string
  managerOwned: boolean
}

function artifactOf(
  ctx: ProviderContext,
  path: string,
  fallbackName: string,
  from: Provenance,
): Artifact | null {
  const read = ctx.readText(path)
  if (read.status !== 'parsed') return null
  const fm = parseFrontmatter(read.text) ?? {}
  const name =
    typeof fm['name'] === 'string' && fm['name'].trim() ? fm['name'].trim() : fallbackName
  const description = typeof fm['description'] === 'string' ? fm['description'].trim() : null
  return {
    name,
    description,
    path,
    scope: from.scope,
    origin: from.origin,
    managerOwned: from.managerOwned,
    body: ctx.readContents ? splitFrontmatter(read.text)[1].replace(/^\n+/, '') : null,
  }
}

/** Every `<dir>/<name>/SKILL.md`, named by its frontmatter `name`, else the folder name. */
export function scanSkills(ctx: ProviderContext, dir: string, from: Provenance): Artifact[] {
  return ctx.listDir(dir).flatMap((e) => {
    if (!e.isDirectory) return []
    const a = artifactOf(ctx, join(dir, e.name, 'SKILL.md'), e.name, from)
    return a ? [a] : []
  })
}

/**
 * Every `*.md` under `dir`, named by its frontmatter `name`, else the file name
 * without `.md`. With `recursive`, sub-folders are walked too (Claude Code
 * namespaces commands by sub-folder but invokes them by file name).
 */
export function scanMarkdown(
  ctx: ProviderContext,
  dir: string,
  from: Provenance,
  options: { recursive?: boolean; useFrontmatterName?: boolean } = {},
): Artifact[] {
  const out: Artifact[] = []
  const walk = (d: string): void => {
    for (const e of ctx.listDir(d)) {
      const abs = join(d, e.name)
      if (e.isDirectory && options.recursive) walk(abs)
      else if (e.isFile && e.name.endsWith('.md')) {
        const fallback = e.name.slice(0, -'.md'.length)
        const a = artifactOf(ctx, abs, fallback, from)
        if (!a) continue
        out.push(options.useFrontmatterName === false ? { ...a, name: fallback } : a)
      }
    }
  }
  walk(dir)
  return out
}

/** Instruction files at `locs`: a file location when it exists, a folder's `.md`/`.mdc` files. */
export function scanInstructions(ctx: ProviderContext, locs: readonly Located[]): Instruction[] {
  const out: Instruction[] = []
  const walk = (d: string, scope: Scope): void => {
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

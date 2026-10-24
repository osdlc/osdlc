/**
 * `detect`: what a repository contains, read from one file listing.
 *
 *   1. List the files once.
 *   2. Match every ecosystem manifest and every tool marker against the list.
 *   3. Make a package of the root and of each directory with a manifest or a
 *      lockfile. Every other marker belongs to the nearest package above it.
 *   4. Parse each manifest once.
 *   5. Run each tool's `detect` (files only), then each detected tool's
 *      `describe` (which may spawn only when execution is allowed).
 *
 * No step runs a repository's own tools unless `allowExec` is set.
 */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { spawnRunnerAsync } from '@osdlc/command-seam'

import { createContext, createContextState } from './context.ts'
import type { DetectOptions, ProviderContext } from './contract.ts'
import { createLister, resolveDiscovery } from './discovery.ts'
import type { ManifestFacts } from './manifests.ts'
import { evidence, type Evidence } from './model.ts'
import { compilePattern, dirOf, joinRel } from './pattern.ts'
import { markersOf, rolesOf, type Registry } from './registry.ts'
import type { Detected, EcosystemDef, MalformedManifest, Package, ProjectProfile } from './tool.ts'
import { which as whichOnPath } from './which.ts'

interface Hit {
  path: string
  /** The directory the match is relative to. */
  base: string
}

interface Builder {
  dir: string
  manifests: ManifestFacts
  manifestFiles: string[]
  ecosystems: Set<string>
  tools: Map<string, { evidence: Evidence[]; facts: unknown[] }>
}

export async function detectProject(
  registry: Registry,
  root: string,
  opts: DetectOptions = {},
): Promise<ProjectProfile> {
  const absRoot = resolve(root)
  const allowExec = opts.allowExec ?? false
  const makeRunner = opts.makeRunner ?? ((binary: string) => spawnRunnerAsync(binary))
  const which = opts.which ?? whichOnPath
  const signal = opts.signal ?? new AbortController().signal
  const excludePaths = opts.excludePaths ?? []
  const useBuiltinExcludes = opts.useBuiltinExcludes ?? true

  const discovery = await resolveDiscovery(absRoot, opts.discovery ?? 'auto', makeRunner('git'))
  const lister = createLister(
    absRoot,
    discovery,
    makeRunner('git'),
    excludePaths,
    useBuiltinExcludes,
  )
  const state = createContextState(lister)
  const ctx = createContext({ absRoot, allowExec, makeRunner, which, signal, discovery, state })
  const all = await lister.all()
  const listed = new Set(all)

  const hits = async (pattern: string): Promise<Hit[]> => {
    const compiled = compilePattern(pattern)
    const out: Hit[] = []
    const seen = new Set<string>()
    for (const path of all) {
      const base = compiled.base(path)
      if (base === null) continue
      // A directory pattern is one piece of evidence, not one per file under it.
      const shown = compiled.directory ? joinRel(base, dirName(compiled)) : path
      if (seen.has(shown)) continue
      seen.add(shown)
      out.push({ path: shown, base })
    }
    // An anchored literal is also checked on disk, so a gitignored local file
    // such as `mise.local.toml` still counts.
    if (out.length === 0 && compiled.anchored && compiled.literal && !listed.has(compiled.path)) {
      if (await ctx.exists(compiled.path)) out.push({ path: compiled.path, base: '.' })
    }
    return out
  }

  const manifestHits: Array<Hit & { eco: EcosystemDef; index: number }> = []
  for (const eco of registry.ecosystems) {
    for (const [index, def] of eco.manifests.entries()) {
      for (const hit of await hits(def.files)) manifestHits.push({ ...hit, eco, index })
    }
  }

  const markerHits: Array<Hit & { tool: string; ev: Evidence; lockfile: boolean }> = []
  for (const tool of registry.tools) {
    for (const marker of markersOf(tool)) {
      for (const hit of await hits(marker.files)) {
        markerHits.push({
          ...hit,
          tool: tool.id,
          ev: evidence(marker.tier, hit.path, marker.files),
          lockfile: marker.lockfile,
        })
      }
    }
  }

  const builders = new Map<string, Builder>()
  const builderFor = (dir: string): Builder => {
    let b = builders.get(dir)
    if (b === undefined) {
      b = { dir, manifests: {}, manifestFiles: [], ecosystems: new Set(), tools: new Map() }
      builders.set(dir, b)
    }
    return b
  }
  builderFor('.')
  for (const hit of manifestHits) builderFor(hit.base)
  for (const hit of markerHits) if (hit.lockfile) builderFor(hit.base)

  const nearest = (dir: string): Builder => {
    for (let current = dir; ; current = dirOf(current)) {
      const b = builders.get(current)
      if (b !== undefined) return b
      if (current === '.') return builderFor('.')
    }
  }
  const addEvidence = (b: Builder, tool: string, ev: Evidence): void => {
    if (!registry.byId.has(tool)) return
    let entry = b.tools.get(tool)
    if (entry === undefined) {
      entry = { evidence: [], facts: [] }
      b.tools.set(tool, entry)
    }
    if (!entry.evidence.some((e) => e.source === ev.source && e.found === ev.found)) {
      entry.evidence.push(ev)
    }
  }

  const malformed: MalformedManifest[] = []
  manifestHits.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.index - b.index))
  for (const hit of manifestHits) {
    const def = hit.eco.manifests[hit.index]!
    const b = builderFor(hit.base)
    if (!b.manifestFiles.includes(hit.path)) b.manifestFiles.push(hit.path)
    b.ecosystems.add(hit.eco.id)
    if (def.tool !== undefined) addEvidence(b, def.tool, evidence('manifest', hit.path, def.files))
    if (def.parse === undefined || def.slot === undefined) continue
    const read = await readManifestText(absRoot, hit.path)
    if ('error' in read) {
      malformed.push({ path: hit.path, error: `unreadable: ${read.error}` })
      continue
    }
    try {
      ;(b.manifests as Record<string, unknown>)[def.slot] = def.parse(read.text, hit.path)
    } catch (err) {
      malformed.push({ path: hit.path, error: `parse failed: ${message(err)}` })
    }
  }

  for (const hit of markerHits) addEvidence(nearest(hit.base), hit.tool, hit.ev)

  // `detect` functions read manifests only, which no loop below changes.
  const beforeDetect = snapshot(registry, builders, all)
  for (const tool of registry.tools) {
    if (tool.detect === undefined) continue
    for (const ev of await tool.detect(ctx, beforeDetect)) {
      addEvidence(nearest(dirOf(ev.source.split('#')[0]!)), tool.id, ev)
    }
  }

  await describeTools(registry, ctx, builders, all, nearest, addEvidence)

  const packages = snapshot(registry, builders, all)
  const union = (pick: (p: Package) => string[], order: readonly string[]): string[] => {
    const found = new Set(packages.flatMap(pick))
    return [
      ...order.filter((id) => found.has(id)),
      ...[...found].filter((id) => !order.includes(id)),
    ]
  }
  const profile: ProjectProfile = {
    root: absRoot,
    generatedAt: new Date().toISOString(),
    discovery,
    allowExec,
    excludePaths: [...excludePaths],
    useBuiltinExcludes,
    packages,
    ecosystems: union(
      (p) => p.ecosystems,
      registry.ecosystems.map((e) => e.id),
    ),
    languages: union((p) => p.languages, []),
    tools: union(
      (p) => p.tools.map((t) => t.tool),
      registry.tools.map((t) => t.id),
    ),
    malformed,
  }
  return profile
}

async function describeTools(
  registry: Registry,
  ctx: ProviderContext,
  builders: Map<string, Builder>,
  all: readonly string[],
  nearest: (dir: string) => Builder,
  addEvidence: (b: Builder, tool: string, ev: Evidence) => void,
): Promise<void> {
  const afterDetect = snapshot(registry, builders, all)
  for (const tool of registry.tools) {
    if (tool.describe === undefined) continue
    const packages = afterDetect.filter((p) => p.tools.some((t) => t.tool === tool.id))
    if (packages.length === 0) continue
    for (const fact of await tool.describe(ctx, packages)) {
      const b = nearest(fact.dir)
      addEvidence(b, tool.id, fact.evidence)
      b.tools.get(tool.id)?.facts.push(fact.fact)
    }
  }
}

/** The packages as they stand, in `dir` order with the root first. */
function snapshot(
  registry: Registry,
  builders: Map<string, Builder>,
  all: readonly string[],
): Package[] {
  const listed = new Set(all)
  return [...builders.values()]
    .sort((a, b) => (a.dir === '.' ? -1 : b.dir === '.' ? 1 : a.dir.localeCompare(b.dir)))
    .map((b): Package => {
      const tools: Detected[] = []
      for (const tool of registry.tools) {
        const entry = b.tools.get(tool.id)
        if (entry === undefined || entry.evidence.length === 0) continue
        tools.push({
          tool: tool.id,
          ...(tool.ecosystem ? { ecosystem: tool.ecosystem.id } : {}),
          roles: rolesOf(tool),
          evidence: [...entry.evidence],
          ...(entry.facts.length > 0 ? { facts: [...entry.facts] } : {}),
        })
      }
      const ecoIds = new Set(b.ecosystems)
      for (const t of tools) if (t.ecosystem !== undefined) ecoIds.add(t.ecosystem)
      const ecosystems = registry.ecosystems.filter((e) => ecoIds.has(e.id))
      const pkg: Package = {
        dir: b.dir,
        ecosystems: ecosystems.map((e) => e.id),
        languages: [],
        manifests: { ...b.manifests },
        manifestFiles: [...b.manifestFiles],
        tools,
      }
      pkg.languages = languagesOf(pkg, ecosystems, listed)
      return pkg
    })
}

function languagesOf(pkg: Package, ecosystems: EcosystemDef[], listed: Set<string>): string[] {
  const deps = dependencyNames(pkg)
  const out: string[] = []
  for (const eco of ecosystems) {
    const rule = eco.languages.find(
      (r) =>
        (r.files === undefined && r.dependencies === undefined && r.tools === undefined) ||
        (r.files ?? []).some((f) => listed.has(joinRel(pkg.dir, f))) ||
        (r.dependencies ?? []).some((d) => deps.has(d)) ||
        (r.tools ?? []).some((t) => pkg.tools.some((d) => d.tool === t)),
    )
    if (rule !== undefined && !out.includes(rule.id)) out.push(rule.id)
  }
  return out
}

/** Every dependency name any of the package's manifests declares. */
function dependencyNames(pkg: Package): Set<string> {
  const names = new Set<string>()
  for (const fact of Object.values(pkg.manifests) as Array<{ deps?: { name: string }[] }>) {
    for (const dep of fact?.deps ?? []) names.add(dep.name)
  }
  return names
}

function dirName(compiled: { path: string; anchored: boolean }): string {
  return compiled.anchored ? compiled.path : compiled.path.split('/').pop()!
}

/** The manifest's text, keeping the OS error's own message on failure. */
async function readManifestText(
  root: string,
  relPath: string,
): Promise<{ text: string } | { error: string }> {
  try {
    return { text: await readFile(join(root, relPath), 'utf-8') }
  } catch (err) {
    return { error: message(err) }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

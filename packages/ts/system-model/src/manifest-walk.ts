/**
 * The filesystem half: find manifests, parse each into a `ManifestInfo`.
 *
 * The reading and parsing of `Cargo.toml`/`package.json` happens once, in
 * `detect`. This file turns the profile's
 * packages into this package's `ManifestInfo` shape, which the Rust-parity
 * fixture suite (`tests/manifest-graph.test.ts`) holds to
 * byte-for-byte agreement with the Rust peer's output on those fixtures only.
 */
// TODO: this walker lacks fixes the Rust peer will have. They disagree on target-table deps, GitHub
// shorthand, npm aliases, `publish = []`, workspace renames and empty names, and no parity test
// covers them. Port the fixes and add fixtures for each case.

import { basename, join } from 'node:path'
import { builtins } from './builtins.ts'
import { createProject } from './project.ts'
import type { CargoFact, DepFact, PackageJsonFact } from './manifests.ts'
import type { MalformedManifest } from './tool.ts'
import { byteCompare, type DepDecl, type ManifestInfo } from './manifest-model.ts'

const project = createProject({ tools: builtins })

/** Directory names the walk always skips. */
export const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  'target',
  'dist',
  '.nuxt',
  '.output',
  '.sdlc',
  '.claude',
] as const

/**
 * The manifest file names the walk reads, at any depth, for a caller that
 * picks manifests out of a file list itself. `MALFORMED_ECOSYSTEMS` is
 * type-checked against it.
 */
export const MANIFEST_FILES = ['package.json', 'Cargo.toml'] as const

/** What `walkManifests` accepts. */
export interface WalkOptions {
  /** Additional directory names to skip, merged with `DEFAULT_EXCLUDES`. */
  exclude?: string[]
}

/**
 * Recursively find and parse every `package.json` and `Cargo.toml` under
 * `root`. Skips the default excluded directory names (plus any in
 * `options.exclude`) and symlinked entries. A malformed manifest becomes an
 * entry with its `error` field set — the walk never throws for one. It throws
 * when system-model's walk hits its file or depth cap, since the list would
 * then be incomplete; exclude the large trees to get under it.
 *
 * Results are sorted by `dir` (then path) for deterministic output.
 */
export async function walkManifests(
  root: string,
  options: WalkOptions = {},
): Promise<ManifestInfo[]> {
  const profile = await project.detect(root, {
    // A raw directory walk, not git: a walk root is often not a repository
    // (a fixture tree, an arbitrary directory a caller points at).
    discovery: 'walk',
    allowExec: false,
    // `useBuiltinExcludes: false`: system-model's built-in exclude list is
    // broader than this one (it also skips `fixtures`, `vendor`, `build`,
    // `.venv`, ...). This package's `DEFAULT_EXCLUDES` is the Rust-parity
    // contract (`walk.rs`'s list), so it must be the whole exclude list.
    excludePaths: [...DEFAULT_EXCLUDES, ...(options.exclude ?? [])],
    useBuiltinExcludes: false,
  })
  // detect's only diagnostic is a walk cap (files or depth). A capped walk
  // misses manifests, and `walk.rs` has no cap, so fail rather than return
  // a partial list.
  const capped = profile.diagnostics ?? []
  if (capped.length > 0) {
    throw new Error(`${root}: ${capped.map((d) => d.message).join('; ')}`)
  }

  const found: ManifestInfo[] = []
  for (const pkg of profile.packages) {
    // The profile uses `"."` for the walk root; `ManifestInfo.dir` uses `""`.
    const dir = pkg.dir === '.' ? '' : pkg.dir
    const { cargo, packageJson } = pkg.manifests
    if (cargo !== undefined) found.push(cargoManifestInfo(profile.root, dir, cargo))
    if (packageJson !== undefined) found.push(nodeManifestInfo(profile.root, dir, packageJson))
  }
  for (const bad of profile.malformed) {
    const info = malformedManifestInfo(profile.root, bad)
    if (info !== null) found.push(info)
  }

  found.sort((a, b) => byteCompare(a.dir, b.dir) || byteCompare(a.path, b.path))
  return found
}

/** Every field `ManifestInfo` has beyond `path`/`dir`/`ecosystem`, before a manifest-kind sets its own. */
function emptyManifest(
  path: string,
  dir: string,
  ecosystem: ManifestInfo['ecosystem'],
): ManifestInfo {
  return {
    path,
    dir,
    ecosystem,
    name: null,
    version: null,
    private: false,
    description: null,
    workspaces: [],
    entry: { main: null, types: null },
    isNuxtLayer: false,
    hasBin: false,
    deps: [],
    error: null,
  }
}

// TODO: a non-string package.json specifier shows as '[object Object]', because
// parsePackageJson in src/plugins/node/package-json.ts calls String(spec).
/** `DepFact[]` is field-for-field `DepDecl[]` (see `DepFact`'s own doc) — no mapping needed. */
function asDeps(deps: DepFact[] | undefined): DepDecl[] {
  return deps ?? []
}

function cargoManifestInfo(root: string, dir: string, fact: CargoFact): ManifestInfo {
  const base = emptyManifest(join(root, fact.manifestPath), dir, 'rust')
  if (fact.error !== undefined) return { ...base, error: fact.error }
  return {
    ...base,
    name: fact.name ?? null,
    version: fact.version ?? null,
    private: fact.private ?? false,
    description: fact.description ?? null,
    workspaces: fact.workspaceMembers ?? [],
    hasBin: fact.hasBin ?? false,
    deps: asDeps(fact.deps),
  }
}

function nodeManifestInfo(root: string, dir: string, fact: PackageJsonFact): ManifestInfo {
  const base = emptyManifest(join(root, fact.manifestPath), dir, 'node')
  const main = fact.main ?? null
  return {
    ...base,
    name: fact.name ?? null,
    version: fact.version ?? null,
    private: fact.private ?? false,
    description: fact.description ?? null,
    workspaces: fact.workspaces ?? [],
    entry: { main, types: fact.types ?? null },
    // The Nuxt-layer convention: `main` points at a nuxt.config.
    isNuxtLayer: main !== null && main.endsWith('nuxt.config.ts'),
    hasBin: fact.hasBin ?? false,
    deps: asDeps(fact.deps),
  }
}

/**
 * A `package.json` or `Cargo.toml` found on disk but too malformed to parse.
 * The walk never throws for one; it reports it like any other manifest.
 * Other ecosystems' manifests are not this package's concern.
 */
function malformedManifestInfo(root: string, bad: MalformedManifest): ManifestInfo | null {
  const ecosystem = MALFORMED_ECOSYSTEMS[basename(bad.path)]
  if (ecosystem === undefined) return null
  const at = bad.path.lastIndexOf('/')
  const dir = at === -1 ? '' : bad.path.slice(0, at)
  return { ...emptyManifest(join(root, bad.path), dir, ecosystem), error: bad.error }
}

const MALFORMED_ECOSYSTEMS: Readonly<Record<string, ManifestInfo['ecosystem']>> = {
  'package.json': 'node',
  'Cargo.toml': 'rust',
} satisfies Record<(typeof MANIFEST_FILES)[number], ManifestInfo['ecosystem']>

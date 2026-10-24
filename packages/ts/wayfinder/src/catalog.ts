/**
 * The one place wayfinder asks `@osdlc/system-model` for a catalog: detect the
 * repository, then collect (or read the cache) with the options wayfinder
 * resolved from flags, config and trust.
 */

import { builtins } from '@osdlc/system-model/builtins'
import {
  createProject,
  type CachedCatalog,
  type Catalog,
  type DiscoveryMode,
  type Project,
  type ProjectProfile,
  type RunnerCacheState,
  type ToolDef,
} from '@osdlc/system-model/detect'

import { orderRunners } from './config.ts'
import { groupRank } from './groups.ts'

/**
 * Everything one collection needs: detection settings and runner selection
 * together, because both come from the same flags and config keys.
 */
export interface WayOptions {
  /** Restrict to these runner ids. */
  only?: string[] | undefined
  /** Skip these runner ids. */
  exclude?: string[] | undefined
  /** Let runners and `describe` functions run the repository's own tools. */
  allowExec?: boolean | undefined
  /** Appended to a withheld runner's diagnostic. */
  execWithheldHint?: string | undefined
  discovery?: DiscoveryMode | 'auto' | undefined
  excludePaths?: string[] | undefined
  signal?: AbortSignal | undefined
}

/** The built-in tools plus `extra`. Throws when two tools share an id. */
export function makeProject(extra: readonly ToolDef[] = []): Project {
  return createProject({ tools: [...builtins, ...extra] })
}

function detect(project: Project, root: string, o: WayOptions): Promise<ProjectProfile> {
  return project.detect(root, {
    allowExec: o.allowExec ?? false,
    discovery: o.discovery,
    excludePaths: o.excludePaths,
    signal: o.signal,
  })
}

function collectOptions(o: WayOptions) {
  return {
    only: o.only,
    exclude: o.exclude,
    allowExec: o.allowExec ?? false,
    execWithheldHint: o.execWithheldHint,
    signal: o.signal,
  }
}

/** Detect, collect, and store each runner's result under `store`. */
export async function collectAndCache(
  project: Project,
  root: string,
  options: WayOptions,
  store: string,
): Promise<Catalog> {
  const profile = await detect(project, root, options)
  return project.runners.collectAndCache(profile, store, collectOptions(options))
}

/** Detect, then read what `store` holds, without running any runner. */
export async function readCachedCatalog(
  project: Project,
  root: string,
  options: WayOptions,
  store: string,
): Promise<CachedCatalog> {
  const profile = await detect(project, root, options)
  return project.runners.readCached(profile, store, collectOptions(options))
}

/** Every report in `catalog`, marked fresh: the verdict right after a probe. */
export function freshStates(catalog: Catalog): RunnerCacheState[] {
  return catalog.reports.map((r) => ({
    runner: r.runner,
    state: 'fresh' as const,
    estimateMs: null,
    slow: false,
  }))
}

/** True when something came out of the store, not only withheld reports. */
export function fromStore(cached: CachedCatalog): boolean {
  return cached.catalog !== null && cached.runners.some((r) => r.ageMs !== undefined)
}

/**
 * A copy of `catalog` with its reports grouped (tasks, dependencies, tools,
 * git hooks) and, within a group, in the configured order.
 */
export function orderedCatalog(catalog: Catalog, order: string[] | undefined): Catalog {
  const reports = orderRunners(catalog.reports, order).sort(
    (a, b) => groupRank(a.runner) - groupRank(b.runner),
  )
  return { ...catalog, reports }
}

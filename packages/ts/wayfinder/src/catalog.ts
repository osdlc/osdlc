/**
 * The one place wayfinder asks `@osdlc/system-model` for a catalog: detect the
 * repository, then collect (or read the cache) with the options wayfinder
 * resolved from flags, config and trust.
 */

import { stat } from 'node:fs/promises'

import { builtins } from '@osdlc/system-model/builtins'
import {
  createProject,
  type CachedCatalog,
  type Catalog,
  type DiscoveryMode,
  type Project,
  type ProjectProfile,
  type RunnerReport,
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
  /** Called with each probed runner's measured time. */
  onProbe?: ((probe: { runner: string; durationMs: number }) => void) | undefined
  /** Called once, before any runner answers, with every runner the collection reports. */
  onRunners?: ((runners: readonly string[]) => void) | undefined
  /** Called with each runner's report as it answers, withheld runners included. */
  onReport?: ((report: RunnerReport) => void) | undefined
  /**
   * Per-tool trust, for a repository that is not trusted as a whole. Used
   * only while `allowExec` is false. See {@link ToolTrust}.
   */
  toolTrust?: ToolTrust | undefined
}

/**
 * Trust grants for single tools. A runner may run its tool when its own id
 * and each tool manager that wraps commands at the root (mise, proto) are
 * trusted: `mise exec -- just` runs mise as well as just. Detection itself
 * runs no tool under a tool grant.
 */
export interface ToolTrust {
  /** The trusted scopes: runner and tool ids. Read on every collection. */
  trusted: ReadonlySet<string>
  /** Called on every collection with each runner's scopes, once detection knows the wrappers. */
  onScopes?: ((scopes: ReadonlyMap<string, readonly string[]>) => void) | undefined
}

/**
 * The project root `dir` is in, found with the built-in tools only. Null when
 * `dir` is not a directory, so a typo never names the enclosing repository.
 */
export async function projectRootFor(dir: string): Promise<string | null> {
  const info = await stat(dir).catch(() => null)
  if (info === null || !info.isDirectory()) return null
  return makeProject().findRoot(dir)
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
    onProbe: o.onProbe,
    onRunners: o.onRunners,
    onReport: o.onReport,
  }
}

/**
 * The tool managers detected at the root that run commands through
 * themselves (`mise exec -- <binary>`), as trust scopes.
 */
function wrapperScopes(project: Project, profile: ProjectProfile): string[] {
  const exec = new Set(
    project.tools.filter((t) => t.roles.toolManager?.exec !== undefined).map((t) => t.id),
  )
  return project
    .toolManagers(profile)
    .map((d) => d.tool)
    .filter((id) => exec.has(id))
}

/** Every scope `runner` needs trusted: its own id, then each wrapper. */
function runnerScopes(runner: string, wrappers: readonly string[]): string[] {
  return [runner, ...wrappers.filter((w) => w !== runner)]
}

/** The ids of every registered tool with a runner role. */
export function runnerIds(project: Project): string[] {
  return project.tools.filter((t) => t.roles.runner !== undefined).map((t) => t.id)
}

/**
 * The runners a tool grant lets run, or null when collection is not split:
 * execution is allowed for all, or there is no per-tool trust. Reports each
 * runner's scopes through `onScopes` first.
 */
function grantedRunners(project: Project, profile: ProjectProfile, o: WayOptions): string[] | null {
  const trust = o.toolTrust
  if (o.allowExec === true || trust === undefined) return null
  const wrappers = wrapperScopes(project, profile)
  const scopes = new Map(runnerIds(project).map((r) => [r, runnerScopes(r, wrappers)]))
  trust.onScopes?.(scopes)
  const granted = [...scopes]
    .filter(([runner, needs]) => {
      if (o.only !== undefined && !o.only.includes(runner)) return false
      if (o.exclude?.includes(runner) === true) return false
      return needs.every((s) => trust.trusted.has(s))
    })
    .map(([runner]) => runner)
  return granted.length > 0 ? granted : null
}

/**
 * The collect options for the runners a tool grant covers, and for the rest.
 * The two collections report as one: `onRunners` once, with both lists, and
 * no report before it.
 */
function splitOptions(o: WayOptions, granted: string[]) {
  // Granted first, then the others, whichever answers first.
  const lists: [(readonly string[])?, (readonly string[])?] = []
  const early: RunnerReport[] = []
  const ready = (): boolean => lists[0] !== undefined && lists[1] !== undefined
  const onReport = (report: RunnerReport): void => {
    if (ready()) o.onReport?.(report)
    else early.push(report)
  }
  const onRunners =
    (slot: 0 | 1) =>
    (ids: readonly string[]): void => {
      lists[slot] = ids
      if (!ready()) return
      o.onRunners?.([...(lists[0] ?? []), ...(lists[1] ?? [])])
      for (const report of early.splice(0)) o.onReport?.(report)
    }
  const base = collectOptions(o)
  const { execWithheldHint: _hint, exclude: _exclude, ...rest } = base
  return {
    granted: { ...rest, onReport, onRunners: onRunners(0), allowExec: true, only: granted },
    others: {
      ...base,
      onReport,
      onRunners: onRunners(1),
      exclude: [...(o.exclude ?? []), ...granted],
    },
  }
}

function mergeCatalogs(granted: Catalog, others: Catalog): Catalog {
  return { ...others, reports: [...granted.reports, ...others.reports] }
}

/**
 * Detect, collect, and store each runner's result under `store`. When a tool
 * grant splits the runners in two, both collections settle before a failure
 * is thrown.
 */
export async function collectAndCache(
  project: Project,
  root: string,
  options: WayOptions,
  store: string,
): Promise<Catalog> {
  const profile = await detect(project, root, options)
  const granted = grantedRunners(project, profile, options)
  if (granted === null) {
    return project.runners.collectAndCache(profile, store, collectOptions(options))
  }
  const split = splitOptions(options, granted)
  // At the same time, so a progress count covers both from the start.
  const [a, b] = await settledBoth(
    project.runners.collectAndCache(profile, store, split.granted),
    project.runners.collectAndCache(profile, store, split.others),
  )
  return mergeCatalogs(a, b)
}

/** Detect, then read what `store` holds, without running any runner. */
export async function readCachedCatalog(
  project: Project,
  root: string,
  options: WayOptions,
  store: string,
): Promise<CachedCatalog> {
  const profile = await detect(project, root, options)
  const granted = grantedRunners(project, profile, options)
  if (granted === null) {
    return project.runners.readCached(profile, store, collectOptions(options))
  }
  const split = splitOptions(options, granted)
  const a = await project.runners.readCached(profile, store, split.granted)
  const b = await project.runners.readCached(profile, store, split.others)
  const catalog =
    a.catalog === null
      ? b.catalog
      : b.catalog === null
        ? a.catalog
        : mergeCatalogs(a.catalog, b.catalog)
  return { catalog, runners: [...a.runners, ...b.runners], allFresh: a.allFresh && b.allFresh }
}

/** Both results once both have settled; the first failure, if any, after both. */
export async function settledBoth<A, B>(a: Promise<A>, b: Promise<B>): Promise<[A, B]> {
  const [ra, rb] = await Promise.allSettled([a, b])
  if (ra.status === 'rejected') throw ra.reason
  if (rb.status === 'rejected') throw rb.reason
  return [ra.value, rb.value]
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
  return { ...catalog, reports: inDisplayOrder(catalog.reports, order) }
}

/** `items` by group, and within a group in the configured order. */
export function inDisplayOrder<T extends { runner: string }>(
  items: readonly T[],
  order: string[] | undefined,
): T[] {
  return orderRunners([...items], order).sort((a, b) => groupRank(a.runner) - groupRank(b.runner))
}

/**
 * Cached collection: read what is stored and check whether it is current,
 * then refresh it.
 *
 *   - {@link readCachedCatalog} probes nothing. It returns what was last
 *     measured, marked fresh, stale or miss per runner, so a caller can show
 *     it at once.
 *   - {@link collectAndStore} probes, returns the catalog, then stores the
 *     results in the background. {@link collectAndCache} waits for the store.
 *
 * Only runners whose tool was detected are read or stored. The selection is
 * the same one `collect` makes from the profile.
 */

import {
  CACHE_FORMAT_VERSION,
  entryPath,
  EXEC_MAX_AGE_MS,
  estimateMs,
  isSlow,
  MODEL_VERSION,
  pushDuration,
  readEntry,
  resolveToolPath,
  toolStampOf,
  writeEntry,
  type CacheEntry,
} from './cache.ts'
import {
  collectRunners,
  execWithheldReport,
  selectRunners,
  stateFor,
  type ProbeRecord,
  type RunnerSpec,
} from './collect.ts'
import type { CollectOptions } from './contract.ts'
import { excludeList } from './discovery.ts'
import {
  MAX_FINGERPRINT_FILES,
  fingerprint,
  fingerprintInputs,
  hashInputs,
  type FingerprintInputs,
} from './fingerprint.ts'
import { CATALOG_SCHEMA_VERSION, type Catalog, type RunnerReport } from './model.ts'
import type { Registry } from './registry.ts'
import type { ProbeCost, ProjectProfile } from './tool.ts'
import { defaultRunner, which as whichOnPath } from './which.ts'

/**
 * Why a cached entry was not usable as it is:
 *
 *   - `changed`: its files changed.
 *   - `max-age`: an exec entry is past its age limit.
 *   - `excludes`: the exclude list changed.
 *   - `exec`: it was probed with execution allowed and now it is not, or the
 *     reverse. An entry probed with execution allowed is not served to a run
 *     without it: its report is left out, as for a miss.
 *   - `version`: another `@osdlc/system-model` version probed it.
 *   - `tool`: the tool's binary resolves to another file or its size or
 *     mtime changed, such as after an upgrade, or it was installed or removed.
 *     Also when a binary the runner looked up through `ctx.which` (a Procfile
 *     manager) is found elsewhere, or appears or goes.
 *
 * @experimental
 */
export type StaleReason = 'changed' | 'max-age' | 'excludes' | 'exec' | 'version' | 'tool'

/**
 * One runner's cache verdict.
 *
 * @experimental
 */
export interface RunnerCacheState {
  runner: string
  state: 'fresh' | 'stale' | 'miss'
  /** Present only when `state` is `stale`. */
  reason?: StaleReason | undefined
  /** Age of the cached probe in ms. Absent on a miss. */
  ageMs?: number | undefined
  /** Expected refresh time: the median of this repository's measured probes. Null when never measured. */
  estimateMs: number | null
  /** True when this repository has measured this runner as slow. */
  slow: boolean
  /**
   * The runner's declared cost, for a hint before anything is measured.
   * Undeclared, an `exec` runner counts as `slow` and a `parse` runner as
   * `cheap`. Always set by `readCached`.
   */
  cost?: ProbeCost | undefined
}

/**
 * What {@link readCachedCatalog} returns.
 *
 * @experimental
 */
export interface CachedCatalog {
  /** Ready to show now. Null when nothing usable was cached. */
  catalog: Catalog | null
  /** One per selected runner, in runner order. */
  runners: RunnerCacheState[]
  /** True when every selected runner was fresh. */
  allFresh: boolean
}

function costOf(spec: RunnerSpec): ProbeCost {
  return spec.role.probe?.cost ?? (spec.role.kind === 'exec' ? 'slow' : 'cheap')
}

function sameExcludes(current: string[], stored: string[] | undefined): boolean {
  if (stored === undefined) return false
  return current.length === stored.length && current.every((value, i) => stored[i] === value)
}

/**
 * Read what is cached and check whether it is current, without probing.
 * Throws only the abort reason, when `options.signal` aborts; it is checked
 * before each runner's files are hashed.
 */
export async function readCachedCatalog(
  registry: Registry,
  profile: ProjectProfile,
  cacheDir: string,
  options: CollectOptions = {},
): Promise<CachedCatalog> {
  const selected = selectRunners(registry, profile, options)
  const allMiss = (): CachedCatalog => ({
    catalog: null,
    runners: selected.map((s) => ({
      runner: s.id,
      state: 'miss',
      estimateMs: null,
      slow: false,
      cost: costOf(s),
    })),
    allFresh: false,
  })

  try {
    const allowExec = options.allowExec ?? false
    const makeRunner = options.makeRunner ?? defaultRunner
    const which = options.which ?? whichOnPath
    const signal = options.signal ?? new AbortController().signal
    const files = stateFor(profile, makeRunner, signal).lister

    const now = Date.now()
    const runners: RunnerCacheState[] = []
    const reports: RunnerReport[] = []
    const takenAts: number[] = []

    for (const spec of selected) {
      // A caller that stopped waiting stops the hashing, one runner at a time.
      signal.throwIfAborted()
      // A withheld exec runner never probed this run, so it cannot be stale.
      if (spec.role.kind === 'exec' && !allowExec) {
        runners.push({
          runner: spec.id,
          state: 'fresh',
          estimateMs: null,
          slow: false,
          cost: costOf(spec),
        })
        reports.push(execWithheldReport(spec, options.execWithheldHint, which))
        continue
      }

      const entry = await readEntry(cacheDir, profile.root, spec.id)
      if (entry === null) {
        runners.push({
          runner: spec.id,
          state: 'miss',
          estimateMs: null,
          slow: false,
          cost: costOf(spec),
        })
        continue
      }

      const takenAt = Date.parse(entry.takenAt)
      const ageMs = Number.isNaN(takenAt) ? 0 : now - takenAt
      const measured = {
        estimateMs: estimateMs(entry.durations ?? []),
        slow: isSlow(entry.durations ?? []),
      }

      // Recomputed from a fresh listing, using the stored paths and every
      // pattern that produced them. Never use the stored expansion of those
      // patterns.
      const current = await fingerprint({
        root: profile.root,
        paths: entry.fingerprint?.paths ?? [],
        patterns: [...(spec.role.watch ?? []), ...(entry.fingerprint?.patterns ?? [])],
        excludes: excludeList(profile.excludePaths, profile.useBuiltinExcludes),
        files,
      })

      let state: RunnerCacheState['state'] = 'fresh'
      let reason: StaleReason | undefined
      const toolPath = spec.binary === undefined ? undefined : resolveToolPath(which(spec.binary))
      // How it was probed is checked first: each one changes the answer
      // whatever the files say.
      if (entry.allowExec !== allowExec) {
        state = 'stale'
        reason = 'exec'
      } else if (entry.modelVersion !== MODEL_VERSION) {
        state = 'stale'
        reason = 'version'
      } else if (
        toolPath !== undefined &&
        (entry.toolPath !== toolPath || (entry.toolStamp ?? null) !== toolStampOf(toolPath))
      ) {
        state = 'stale'
        reason = 'tool'
      } else if (
        Object.entries(entry.lookups ?? {}).some(([binary, found]) => which(binary) !== found)
      ) {
        // A runner that chose a tool by what is on the PATH (a Procfile
        // manager) gives another answer once that changes.
        state = 'stale'
        reason = 'tool'
      } else if (!sameExcludes(current.excludes, entry.fingerprint?.excludes)) {
        // Checked before the digest. A changed exclude list explains a changed
        // digest, and widening the list can leave the digest unchanged.
        state = 'stale'
        reason = 'excludes'
      } else if (current.digest !== entry.fingerprint?.digest) {
        state = 'stale'
        reason = 'changed'
      } else if (spec.role.kind === 'exec' && ageMs > EXEC_MAX_AGE_MS) {
        // Only exec entries expire by age, because their tool merges files
        // the digest cannot see.
        state = 'stale'
        reason = 'max-age'
      }

      runners.push({ runner: spec.id, state, reason, ageMs, ...measured, cost: costOf(spec) })
      // A report that ran the repository's tools does not answer a run that
      // may not run them.
      if (reason === 'exec' && entry.allowExec) continue
      // A stale entry is kept otherwise. An answer that was true an hour ago is better
      // than nothing, as long as it is marked stale.
      reports.push(entry.report)
      if (!Number.isNaN(takenAt)) takenAts.push(takenAt)
    }

    // The catalog's time is that of its oldest entry.
    const oldest = takenAts.length === 0 ? now : Math.min(...takenAts)
    return {
      catalog:
        reports.length === 0
          ? null
          : {
              kind: 'catalog',
              schemaVersion: CATALOG_SCHEMA_VERSION,
              root: profile.root,
              generatedAt: new Date(oldest).toISOString(),
              discovery: profile.discovery,
              allowExec,
              reports,
            },
      runners,
      allFresh: runners.every((r) => r.state === 'fresh'),
    }
  } catch (err) {
    if (options.signal?.aborted === true) throw err
    return allMiss()
  }
}

/**
 * What {@link collectAndStore} returns.
 *
 * @experimental
 */
export interface StoringCatalog {
  /** The catalog {@link collectAndCache} returns, ready to show. */
  catalog: Catalog
  /**
   * Settles when every runner's entry is written, or has failed to be. Never
   * rejects. Await it before the process exits, or the store keeps the last
   * probe's entries.
   */
  stored: Promise<void>
}

/**
 * The entry writes in flight in this process, by cache file. A write waits
 * for the one before it to the same file, so an older probe never lands
 * after a newer one.
 */
const writing = new Map<string, Promise<void>>()

/**
 * Probe, then store the results in the background. `catalog` is ready once
 * every runner has answered, with a diagnostic for each runner whose
 * fingerprint was truncated. The files are hashed and written after that,
 * and `stored` settles when they are. A failed write never fails the
 * collection.
 */
export async function collectAndStore(
  registry: Registry,
  profile: ProjectProfile,
  cacheDir: string,
  options: CollectOptions = {},
): Promise<StoringCatalog> {
  const probes: ProbeRecord[] = []
  const catalog = await collectRunners(registry, profile, {
    ...options,
    probeObserver: (probe) => probes.push(probe),
  })
  const excludes = excludeList(profile.excludePaths, profile.useBuiltinExcludes)

  // Listing only: whether a fingerprint reaches the cap is known before any
  // file is hashed, so the catalog can say so at once.
  const inputs = await Promise.all(
    probes.map((probe) =>
      fingerprintInputs({
        paths: probe.reads,
        patterns: [...probe.watch, ...probe.queries],
        excludes,
        files: probe.files,
      }).catch(() => null),
    ),
  )
  const truncated = new Set(
    probes.filter((_, i) => inputs[i]?.truncated === true).map((p) => p.runner),
  )

  const takenAt = new Date().toISOString()
  const stored = Promise.all(
    probes.map((probe, i) => {
      const input = inputs[i]
      return input === null || input === undefined
        ? Promise.resolve()
        : storeProbe(cacheDir, catalog, probe, input, takenAt)
    }),
  ).then(() => undefined)

  return { catalog: withTruncationNotes(catalog, truncated), stored }
}

/**
 * Probe and store the results: {@link collectAndStore}, settled once every
 * entry is written. A failed write never fails the collection.
 */
export async function collectAndCache(
  registry: Registry,
  profile: ProjectProfile,
  cacheDir: string,
  options: CollectOptions = {},
): Promise<Catalog> {
  const { catalog, stored } = await collectAndStore(registry, profile, cacheDir, options)
  await stored
  return catalog
}

/** Hash one probe's files and write its entry, after any earlier write to the same file. */
function storeProbe(
  cacheDir: string,
  catalog: Catalog,
  probe: ProbeRecord,
  input: FingerprintInputs,
  takenAt: string,
): Promise<void> {
  const key = entryPath(cacheDir, catalog.root, probe.runner)
  const previous = writing.get(key) ?? Promise.resolve()
  const done = previous
    .then(async () => {
      const print = await hashInputs(catalog.root, input)
      const before = await readEntry(cacheDir, catalog.root, probe.runner)
      const entry: CacheEntry = {
        version: CACHE_FORMAT_VERSION,
        root: catalog.root,
        runner: probe.runner,
        kind: probe.kind,
        takenAt,
        probeMs: probe.durationMs,
        durations: pushDuration(before, probe.durationMs),
        fingerprint: print,
        report: probe.report,
        allowExec: catalog.allowExec,
        modelVersion: MODEL_VERSION,
        lookups: probe.lookups,
        ...(probe.report.tool === undefined
          ? {}
          : toolFields(resolveToolPath(probe.report.tool.path ?? null))),
      }
      // `writeEntry` refuses errored and withheld reports.
      await writeEntry(cacheDir, entry)
    })
    .catch(() => {
      // A failed write only makes the next run slower.
    })
    .finally(() => {
      if (writing.get(key) === done) writing.delete(key)
    })
  writing.set(key, done)
  return done
}

/** `catalog` with a note on each report in `truncated` that its fingerprint was cut at the cap. */
function withTruncationNotes(catalog: Catalog, truncated: ReadonlySet<string>): Catalog {
  if (truncated.size === 0) return catalog
  return {
    ...catalog,
    reports: catalog.reports.map((report) =>
      truncated.has(report.runner)
        ? {
            ...report,
            diagnostics: [
              ...report.diagnostics,
              {
                severity: 'info' as const,
                message:
                  `${report.runner}: fingerprint covers only the first ` +
                  `${MAX_FINGERPRINT_FILES} files, so a later change beyond that ` +
                  `cap may leave the cached result looking fresh`,
              },
            ],
          }
        : report,
    ),
  }
}

function toolFields(toolPath: string | null): Pick<CacheEntry, 'toolPath' | 'toolStamp'> {
  return { toolPath, toolStamp: toolStampOf(toolPath) }
}

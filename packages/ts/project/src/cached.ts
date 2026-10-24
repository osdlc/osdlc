/**
 * The cached collection a surface consumes: read what is stored and judge
 * it, then refresh it.
 *
 *   - {@link readCachedCatalog} probes nothing. It returns what was last
 *     measured, labelled per runner fresh, stale or miss, so a surface can
 *     paint at once.
 *   - {@link collectAndCache} probes and stores what came back.
 *
 * Only runners whose tool was detected are read or stored: the selection is
 * the same one `collect` makes from the profile.
 */

import { spawnRunnerAsync } from '@osdlc/command-seam'

import {
  CACHE_FORMAT_VERSION,
  EXEC_MAX_AGE_MS,
  estimateMs,
  isSlow,
  pushDuration,
  readEntry,
  writeEntry,
  type CacheEntry,
} from './cache.ts'
import {
  collectRunners,
  execWithheldReport,
  selectRunners,
  stateFor,
  type ProbeRecord,
} from './collect.ts'
import type { CollectOptions } from './contract.ts'
import { MAX_FINGERPRINT_FILES, fingerprint } from './fingerprint.ts'
import type { Catalog, RunnerReport } from './model.ts'
import type { Registry } from './registry.ts'
import type { ProjectProfile } from './tool.ts'
import { which as whichOnPath } from './which.ts'

/**
 * Why a cached entry was not usable as it is: its files changed, an exec
 * entry is past its age limit, or the exclude list changed.
 *
 * @experimental
 */
export type StaleReason = 'changed' | 'max-age' | 'excludes'

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
  /** Age of the cached probe in ms; absent on a miss. */
  ageMs?: number | undefined
  /** Expected refresh time, the median of this repository's measured probes; null when never measured. */
  estimateMs: number | null
  /** True when this repository has measured this runner as slow. */
  slow: boolean
}

/**
 * What {@link readCachedCatalog} returns.
 *
 * @experimental
 */
export interface CachedCatalog {
  /** Paintable now; null when nothing usable was cached. */
  catalog: Catalog | null
  /** One per selected runner, in runner order. */
  runners: RunnerCacheState[]
  /** True when every selected runner was fresh. */
  allFresh: boolean
}

function sameExcludes(current: string[], stored: string[] | undefined): boolean {
  if (stored === undefined) return false
  return current.length === stored.length && current.every((value, i) => stored[i] === value)
}

/** Read what is cached and judge it, without probing. Never throws. */
export async function readCachedCatalog(
  registry: Registry,
  profile: ProjectProfile,
  cacheDir: string,
  options: CollectOptions = {},
): Promise<CachedCatalog> {
  const selected = selectRunners(registry, profile, options)
  const allMiss = (): CachedCatalog => ({
    catalog: null,
    runners: selected.map((s) => ({ runner: s.id, state: 'miss', estimateMs: null, slow: false })),
    allFresh: false,
  })

  try {
    const allowExec = options.allowExec ?? false
    const makeRunner = options.makeRunner ?? ((binary: string) => spawnRunnerAsync(binary))
    const which = options.which ?? whichOnPath
    const files = stateFor(profile, () => makeRunner('git')).lister

    const now = Date.now()
    const runners: RunnerCacheState[] = []
    const reports: RunnerReport[] = []
    const takenAts: number[] = []

    for (const spec of selected) {
      // A withheld exec runner never probed this run, so it cannot be stale.
      if (spec.role.kind === 'exec' && !allowExec) {
        runners.push({ runner: spec.id, state: 'fresh', estimateMs: null, slow: false })
        reports.push(execWithheldReport(spec, options.execWithheldHint, which))
        continue
      }

      const entry = await readEntry(cacheDir, profile.root, spec.id)
      if (entry === null) {
        runners.push({ runner: spec.id, state: 'miss', estimateMs: null, slow: false })
        continue
      }

      const takenAt = Date.parse(entry.takenAt)
      const ageMs = Number.isNaN(takenAt) ? 0 : now - takenAt
      const measured = {
        estimateMs: estimateMs(entry.durations ?? []),
        slow: isSlow(entry.durations ?? []),
      }

      // Recomputed against the live listing from the stored paths and every
      // pattern that built them, never the stored expansion of those patterns.
      const current = await fingerprint({
        root: profile.root,
        paths: entry.fingerprint?.paths ?? [],
        patterns: [...(spec.role.watch ?? []), ...(entry.fingerprint?.patterns ?? [])],
        excludes: profile.excludePaths,
        files,
      })

      let state: RunnerCacheState['state'] = 'fresh'
      let reason: StaleReason | undefined
      // Checked before the digest: a changed exclude list explains a changed
      // digest, and widening it can leave the digest unchanged.
      if (!sameExcludes(current.excludes, entry.fingerprint?.excludes)) {
        state = 'stale'
        reason = 'excludes'
      } else if (current.digest !== entry.fingerprint?.digest) {
        state = 'stale'
        reason = 'changed'
      } else if (spec.role.kind === 'exec' && ageMs > EXEC_MAX_AGE_MS) {
        // Only exec entries age out: their tool merges files the digest
        // cannot see.
        state = 'stale'
        reason = 'max-age'
      }

      runners.push({ runner: spec.id, state, reason, ageMs, ...measured })
      // A stale row is kept: an answer that was true an hour ago beats an
      // empty screen, as long as the screen says which it is.
      reports.push(entry.report)
      if (!Number.isNaN(takenAt)) takenAts.push(takenAt)
    }

    // The catalog is only as fresh as its stalest row.
    const oldest = takenAts.length === 0 ? now : Math.min(...takenAts)
    return {
      catalog:
        reports.length === 0
          ? null
          : {
              root: profile.root,
              generatedAt: new Date(oldest).toISOString(),
              discovery: profile.discovery,
              allowExec,
              reports,
            },
      runners,
      allFresh: runners.every((r) => r.state === 'fresh'),
    }
  } catch {
    return allMiss()
  }
}

/**
 * Probe and write what came back. The returned catalog is `collect`'s, plus a
 * diagnostic where a fingerprint was truncated. Cache writes never fail the
 * collection.
 */
export async function collectAndCache(
  registry: Registry,
  profile: ProjectProfile,
  cacheDir: string,
  options: CollectOptions = {},
): Promise<Catalog> {
  const probes: ProbeRecord[] = []
  const catalog = await collectRunners(registry, profile, {
    ...options,
    probeObserver: (probe) => probes.push(probe),
  })

  const truncated = new Set<string>()
  for (const probe of probes) {
    try {
      const print = await fingerprint({
        root: catalog.root,
        paths: probe.reads,
        patterns: [...probe.watch, ...probe.queries],
        excludes: profile.excludePaths,
        files: probe.files,
      })
      if (print.truncated) truncated.add(probe.runner)

      const previous = await readEntry(cacheDir, catalog.root, probe.runner)
      const entry: CacheEntry = {
        version: CACHE_FORMAT_VERSION,
        root: catalog.root,
        runner: probe.runner,
        kind: probe.kind,
        takenAt: new Date().toISOString(),
        probeMs: probe.durationMs,
        durations: pushDuration(previous, probe.durationMs),
        fingerprint: print,
        report: probe.report,
      }
      // `writeEntry` refuses errored and withheld reports.
      await writeEntry(cacheDir, entry)
    } catch {
      // A store that cannot be written costs the next run some time, nothing more.
    }
  }

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

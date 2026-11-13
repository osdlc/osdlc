/**
 * Planning: pair each rule source with the changed files it governs, as jobs.
 * Pure, so it can be golden-tested. Selection rationale: docs/planning/decisions/D-05-selection-by-scope.md.
 */
import { selectByScope } from './select.ts'
import type { RuleSource, ReviewConfig, ReviewJob } from './types.ts'

/** What `planJobs` returns: the jobs to run and the sources that matched no file. */
export interface PlanResult {
  jobs: ReviewJob[]
  /** Sources that matched nothing — reported, so a silent drop is visible. */
  skipped: { id: string; label: string }[]
}

/**
 * Pair every rule source with the changed files it governs.
 *
 * @param sources - Discovered rule sources. Ids must be unique (see `selectByScope`).
 * @param changedFiles - Repo-relative paths in the changeset.
 * @param config - `exclude` prunes the changeset; `maxFilesPerJob` caps how
 * many files one job carries, splitting a broad source across several.
 * @returns Jobs in broad-to-specific order, plus the sources that were dropped.
 */
export function planJobs(
  sources: readonly RuleSource[],
  changedFiles: readonly string[],
  config: Pick<ReviewConfig, 'exclude' | 'maxFilesPerJob'>,
): PlanResult {
  const { covered } = selectByScope(
    sources.map((s) => ({ id: s.id, patterns: s.patterns })),
    changedFiles,
    config.exclude,
  )

  const jobs: ReviewJob[] = []
  const skipped: { id: string; label: string }[] = []
  for (const source of sources) {
    const group = covered.get(source.id)
    if (group === undefined) {
      skipped.push({ id: source.id, label: source.label })
      continue
    }
    for (const shard of shardFiles(group, config.maxFilesPerJob)) {
      jobs.push({ source, ...shard })
    }
  }

  jobs.sort(byBreadth)
  return { jobs, skipped }
}

/**
 * Split one source's files into jobs of at most `limit` files.
 *
 * Consecutive slices of the incoming order, which is the changeset's own
 * order, so a shard boundary lands between neighbouring paths and each job
 * tends to cover one area of the tree. A single shard carries no `shard`
 * field.
 */
function shardFiles(
  files: readonly string[],
  limit: number,
): { files: readonly string[]; shard?: { index: number; of: number } }[] {
  if (limit <= 0 || files.length <= limit) return [{ files }]

  // Spread evenly rather than filling each shard to the limit, so five files
  // over a limit of four become 3+2 and not 4+1 — a one-file job judges
  // nothing the others did not, and costs a whole call to say so. The first
  // n % count shards take one file more than the rest, so no two differ by
  // more than one (13 over 4 is 4+3+3+3).
  const count = Math.ceil(files.length / limit)
  const base = Math.floor(files.length / count)
  const extra = files.length % count
  const slices: (readonly string[])[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0)
    slices.push(files.slice(at, at + size))
    at += size
  }

  return slices.map((sliced, i) => ({
    files: sliced,
    shard: { index: i + 1, of: slices.length },
  }))
}

/**
 * Broadest scope first, ties broken by id so ordering is total and stable.
 * Reports read top-down from repo-wide rules to the most local ones.
 */
function byBreadth(a: ReviewJob, b: ReviewJob): number {
  if (a.source.depth !== b.source.depth) return a.source.depth - b.source.depth
  if (a.source.id !== b.source.id) return a.source.id < b.source.id ? -1 : 1
  return (a.shard?.index ?? 0) - (b.shard?.index ?? 0)
}

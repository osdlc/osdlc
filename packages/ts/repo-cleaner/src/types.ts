/**
 * The inventory a sweep produces, and the vocabulary it is described in.
 *
 * One shape serves every category. A caller that wants only worktrees filters
 * by `category` rather than reading a different type, and a host that adds its
 * own knowledge (an issue tracker's linkage, say) rewrites rows in place.
 */

/** What the sweep concluded about an item. */
export type Classification = 'safe-to-delete' | 'safe-to-keep' | 'needs-investigation'

/** The kinds of thing a sweep inventories. */
export type Category = 'local_branch' | 'worktree' | 'remote_branch'

/** Which categories to gather. */
export const ALL_SCOPES = ['local-branches', 'worktrees', 'remote-branches'] as const

export type Scope = (typeof ALL_SCOPES)[number]

/**
 * A risk a delete or remove carries, which the user approves by name:
 *   `abandon-unmerged`  drops commits not on the default branch or a merged PR
 *   `discard-changes`   drops a worktree's modified, staged or untracked files
 *   `confirm-open-pr`   the branch has an open PR; deleting the remote branch closes it
 */
export const AUTHORIZATIONS = ['abandon-unmerged', 'discard-changes', 'confirm-open-pr'] as const

export type Authorization = (typeof AUTHORIZATIONS)[number]

/** The authorizations whose flag is set, in canonical order. */
export function authorizationsFor(flags: Partial<Record<Authorization, boolean>>): Authorization[] {
  return AUTHORIZATIONS.filter((name) => flags[name] === true)
}

/** What the sweep learned about a repository before inventorying it. */
export interface RepoInfo {
  /** The main checkout's root, even when the sweep was pointed at a worktree. */
  root: string
  /** `owner/name` when the remote is a recognisable host coordinate. */
  slug: string | null
  mainBranch: string
  remote: string | null
  currentBranch: string
  hasGh: boolean
  ghAuthenticated: boolean
  /** True when the sweep fetched the remote before classifying. */
  fetched: boolean
}

/** The ref a branch must reach to count as landed: `<remote>/<default>`, or the local default without a remote. */
export function landedRef(repo: RepoInfo): string {
  return repo.remote === null ? repo.mainBranch : `${repo.remote}/${repo.mainBranch}`
}

/** True when the repository has a remote the sweep did not fetch, so its refs may be stale. */
export function isUnfetched(repo: RepoInfo): boolean {
  return repo.remote !== null && !repo.fetched
}

/** A pull request, reduced to what classification consults. */
export interface PRInfo {
  number: number
  state: string
  mergedAt: string | null
  headRef: string
  /** The PR's head commit; null when `gh` did not report one. */
  headOid: string | null
  /** The branch the PR targets. */
  baseRef: string
  title: string
  url: string
}

export interface SweepItem {
  category: Category
  id: string
  classification: Classification
  action: string
  /** One line, already phrased for a report. */
  reason: string
  /** The evidence behind the verdict. A host re-ranking a row reads these. */
  facts: Record<string, unknown>
  /** Literal commands that would carry out `action`. Never run by this library. */
  commands: string[]
  /**
   * Sentences explaining what is unclear, for a `needs-investigation` row.
   *
   * Parts rather than one string: a host with knowledge this library does not
   * have appends its own sentence before anything is rendered. Empty for a row
   * that needs no investigation.
   */
  investigationParts: string[]
  /** What deleting or removing this row would need approved. */
  requires: Authorization[]
  /**
   * False for a row kept for structure, such as the default branch, and for a
   * blocked worktree. Never offered for deletion.
   */
  deletable: boolean
}

/** One repository's inventory, or the reason there is none. */
export interface RepoSweep {
  /** Present when the repository could be read. */
  repo: RepoInfo | null
  /** The path the sweep was pointed at, whether or not it could be read. */
  path: string
  items: SweepItem[]
  /** Why this repository produced no inventory. Null on success. */
  error: string | null
}

/** An entry that named no repository. */
export interface UnresolvedEntry {
  entry: string
  reason: string
}

/**
 * What resolving the entries cost. An entry that is itself a checkout costs
 * nothing to find; a container is walked, and a person who points one at the
 * wrong directory deserves to be told how much was read.
 */
export interface ScanStats {
  /** Entries that had to be searched, rather than naming a checkout outright. */
  containers: number
  /** Directories read across those searches. */
  directoriesScanned: number
  /** Directories left unopened because the depth cap stopped the walk. */
  depthLimited: number
  /** Checkouts found by those searches, worktrees included, before de-duplication. */
  checkoutsFound: number
}

/** One remote checked out as two or more separate main checkouts. */
export interface DuplicateCheckout {
  slug: string
  /** Main-checkout paths, sorted. */
  roots: string[]
}

/** Every repository swept in one run, plus the entries that named none. */
export interface SweepResult {
  repos: RepoSweep[]
  unresolved: UnresolvedEntry[]
  scan: ScanStats
  duplicates: DuplicateCheckout[]
}

/**
 * Slugs shared by two or more of `repos`, roots sorted. A null entry or a
 * repository without a slug is left out.
 */
export function findDuplicateCheckouts(
  repos: readonly ({ root: string; slug: string | null } | null)[],
): DuplicateCheckout[] {
  const bySlug = new Map<string, Set<string>>()
  for (const repo of repos) {
    if (repo?.slug == null) continue
    const roots = bySlug.get(repo.slug) ?? new Set<string>()
    roots.add(repo.root)
    bySlug.set(repo.slug, roots)
  }
  return [...bySlug]
    .filter(([, roots]) => roots.size > 1)
    .map(([slug, roots]) => ({ slug, roots: [...roots].sort() }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

export function emptyScan(): ScanStats {
  return { containers: 0, directoriesScanned: 0, depthLimited: 0, checkoutsFound: 0 }
}

export interface SummaryBucket {
  total: number
  'safe-to-delete': number
  'safe-to-keep': number
  'needs-investigation': number
}

export function emptyBucket(): SummaryBucket {
  return { total: 0, 'safe-to-delete': 0, 'safe-to-keep': 0, 'needs-investigation': 0 }
}

/** Per-category counts over `items`. */
export function summarize(items: readonly SweepItem[]): Record<string, SummaryBucket> {
  const out: Record<string, SummaryBucket> = {}
  for (const item of items) {
    const bucket = (out[item.category] ??= emptyBucket())
    bucket.total += 1
    bucket[item.classification] += 1
  }
  return out
}

type Defaulted = 'facts' | 'commands' | 'investigationParts' | 'requires' | 'deletable'

/** Build an item, defaulting the collection fields and `deletable: true`. */
export function makeItem(
  partial: Omit<SweepItem, Defaulted> & Partial<Pick<SweepItem, Defaulted>>,
): SweepItem {
  return {
    category: partial.category,
    id: partial.id,
    classification: partial.classification,
    action: partial.action,
    reason: partial.reason,
    facts: partial.facts ?? {},
    commands: partial.commands ?? [],
    investigationParts: partial.investigationParts ?? [],
    requires: partial.requires ?? [],
    deletable: partial.deletable ?? true,
  }
}

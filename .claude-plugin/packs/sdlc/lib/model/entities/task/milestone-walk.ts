/**
 * The milestone and roadmap half of `sdlc task next`'s frontier walk
 * ([[D-Q2WR-task-pickup-order]], [[T-JSJJ]]).
 *
 * The walk goes task, then milestone, then the milestone's place in the
 * release order. That place becomes the first rank key of `task next`, ahead
 * of priority, so the release order decides what is next and the sort chain
 * only orders work within one milestone.
 *
 * **Task to milestone.** Only open milestones count; a closed one (done,
 * superseded, dropped) is history and neither claims tasks nor ranks. A task
 * belongs to every open milestone that lists it in `tasks:`; only when none
 * does, to the open milestones its own `related:` names (the task schema has
 * no dedicated `milestone` field; this is the same loose link `roadmap check
 * --strict-order` reads); and only when that finds none, to those its
 * `parent_key` task belongs to by either route (one level, as in that check).
 * A task in several milestones ranks by the earliest and is gated by all of
 * them. A task in none is unmilestoned: it ranks after every milestoned task
 * and a goal scope cuts it.
 *
 * **Milestone to release order.** A milestone's version is the heading of the
 * `## vX.Y.Z` section that lists it on an open roadmap; one a roadmap does not
 * place falls back to its own `version:`; one with neither, or whose version
 * is not a full `X.Y.Z` semver, is unpositioned and sorts last. Versions are
 * ranked by semver precedence, and milestones sharing a version share a rank.
 * Reading the roadmap first keeps the roadmap the one ordering ([[RM-DO9Z]]);
 * a milestone's `version:` is what `roadmap check --strict-order` holds equal
 * to its section heading anyway.
 */

import { cmpStr } from '@lib/util/strings'
import { stringList } from '@lib/util/site_table'
import { canonicalSemver, compareSemver, parseSemver } from '@lib/util/semver'
import { unwrapWikilink } from '@lib/util/wikilinks'
import { resolveTarget, type CorpusEntry } from '@lib/model/corpus'
import { scanEntities } from '@lib/model/read'
import { scanTopLevelMilestoneLinks } from '../roadmap/sections'
import { sectionVersion } from '../roadmap/order'

/** Rank of a task no milestone claims, and of a milestone with no version. */
export const UNPOSITIONED_RANK = Number.MAX_SAFE_INTEGER

/** One milestone's place in the release order. */
export interface MilestonePosition {
  /** Rank among distinct versions, ascending; {@link UNPOSITIONED_RANK} when it has none. */
  rank: number
  /** The canonical `X.Y.Z[-pre]` version the rank came from; `null` when unpositioned. */
  version: string | null
}

export interface MilestoneWalk {
  /** Every open milestone basename to its release-order position. */
  positions: ReadonlyMap<string, MilestonePosition>
  /** Every open milestone basename to its raw frontmatter (for `depends_on`). */
  frontmatter: ReadonlyMap<string, Record<string, unknown>>
  /** The open milestones a task belongs to, earliest release first; empty when none. */
  milestonesOf: (taskBasename: string, taskFm: Record<string, unknown>) => string[]
}

/** Semver order of two canonical versions (as {@link MilestonePosition.version} holds them). */
export function compareVersions(a: string, b: string): number {
  return compareSemver(parseSemver(a)!, parseSemver(b)!)
}

/** A version value as its canonical `X.Y.Z[-pre]` spelling; `null` when absent or not a full semver. */
export function canonicalVersion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const parsed = parseSemver(raw)
  return parsed === null ? null : canonicalSemver(parsed)
}

function resolveLink(raw: string, names: ReadonlySet<string>): string | null {
  return resolveTarget(unwrapWikilink(raw) ?? raw, names)
}

/**
 * Version each milestone is listed under on an open roadmap's `## vX.Y.Z`
 * sections (the earliest, when listed under several). Roadmaps are read
 * through the entity scan, not straight off disk.
 */
function roadmapVersions(
  projectRoot: string,
  corpus: ReadonlyMap<string, CorpusEntry>,
): Map<string, string> {
  const names = new Set(corpus.keys())
  const out = new Map<string, string>()
  for (const row of scanEntities('roadmap', projectRoot, { withText: true })) {
    if (!String(row.fm?.['state'] ?? '').startsWith('open/')) continue
    for (const occ of scanTopLevelMilestoneLinks(row.text ?? '', names)) {
      const version = canonicalVersion(sectionVersion(occ.sectionName))
      if (version === null || occ.resolved === null) continue
      const seen = out.get(occ.resolved)
      if (seen === undefined || compareVersions(version, seen) < 0) out.set(occ.resolved, version)
    }
  }
  return out
}

/** Build the task-to-milestone-to-release-order walk for one project. */
export function buildMilestoneWalk(
  projectRoot: string,
  corpus: ReadonlyMap<string, CorpusEntry>,
  taskFm: ReadonlyMap<string, Record<string, unknown>>,
): MilestoneWalk {
  const names = new Set(corpus.keys())
  const fromRoadmap = roadmapVersions(projectRoot, corpus)

  // Open milestones only: a closed one is history.
  const frontmatter = new Map<string, Record<string, unknown>>()
  const versions = new Map<string, string | null>()
  for (const row of scanEntities('milestone', projectRoot)) {
    const fm = row.fm ?? {}
    if (!String(fm['state'] ?? '').startsWith('open/')) continue
    frontmatter.set(row.basename, fm)
    versions.set(row.basename, fromRoadmap.get(row.basename) ?? canonicalVersion(fm['version']))
  }

  const ranked = [...new Set([...versions.values()].filter((v): v is string => v !== null))].sort(
    compareVersions,
  )
  const positions = new Map<string, MilestonePosition>()
  for (const [basename, version] of versions) {
    positions.set(
      basename,
      version === null
        ? { rank: UNPOSITIONED_RANK, version: null }
        : { rank: ranked.indexOf(version), version },
    )
  }

  const rosterOf = new Map<string, string[]>()
  for (const [milestone, fm] of frontmatter) {
    for (const raw of stringList(fm['tasks'])) {
      const task = resolveLink(raw, names)
      if (task === null) continue
      const bucket = rosterOf.get(task)
      if (bucket === undefined) rosterOf.set(task, [milestone])
      else bucket.push(milestone)
    }
  }

  const byRelease = (a: string, b: string): number =>
    positions.get(a)!.rank - positions.get(b)!.rank || cmpStr(a, b)

  /** The task's own claims: `tasks:` rosters, else `related:` links. */
  const direct = (basename: string, fm: Record<string, unknown>): string[] => {
    const listed = rosterOf.get(basename) ?? []
    if (listed.length > 0) return listed
    return stringList(fm['related'])
      .map((raw) => resolveLink(raw, names))
      .filter((t): t is string => t !== null && frontmatter.has(t))
  }

  return {
    positions,
    frontmatter,
    milestonesOf: (basename, fm) => {
      let found = direct(basename, fm)
      if (found.length === 0) {
        const parentRaw = fm['parent_key']
        const parent = typeof parentRaw === 'string' ? resolveLink(parentRaw, names) : null
        const parentFm = parent === null ? undefined : taskFm.get(parent)
        if (parent !== null && parentFm !== undefined) found = direct(parent, parentFm)
      }
      return [...new Set(found)].sort(byRelease)
    },
  }
}

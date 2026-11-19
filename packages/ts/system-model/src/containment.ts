/**
 * Containment: the tree a repository's directory layout implies.
 *
 * Dependencies are a mesh and belong on edges. Containment is a tree and
 * belongs on `GraphNode.parent`; a tree smuggled in as edges has to be
 * re-derived by every consumer.
 *
 * Three node populations come out of this pass:
 *
 * - the single `repo` root — always synthetic, standing for the checkout;
 * - synthetic `group` nodes for directories that HOLD manifests but declare
 *   none (`packages/ts`, `apps`), minus the ones that carry no information —
 *   see chain collapse below;
 * - the manifests themselves, each parented to its nearest ancestor.
 *
 * Externals stay outside the tree: a registry package is not *within* the
 * repo. They are optionally gathered under one synthetic group per ecosystem
 * so a viewer can fold the whole registry cloud with one click.
 */

import {
  byteCompare,
  type DependencyGraph,
  type Ecosystem,
  type GraphNode,
} from './manifest-model.ts'

export interface ContainmentOptions {
  /** Name for the repo root node. Default `'repository'`. */
  rootLabel?: string
  /** Gather external nodes under one synthetic group per ecosystem. Default true. */
  groupExternals?: boolean
}

/**
 * Synthetic id for the containment root. As with the external groups, the `:`
 * keeps it clear of every real package and crate name — and of the `'.'` a
 * virtual cargo workspace root at the checkout top already falls back to.
 */
export const ROOT_ID = 'repo:root'

/**
 * Synthetic id for the per-ecosystem external group. `:` cannot appear in an
 * npm package name or a crate name, so these cannot collide with a real one.
 */
function externalGroupId(ecosystem: Ecosystem): string {
  return ecosystem === 'node' ? 'external:node' : 'external:rust'
}

function externalGroupLabel(ecosystem: Ecosystem): string {
  return ecosystem === 'node' ? 'npm' : 'crates.io'
}

/**
 * Opening of the warning this pass emits when a group directory's id is taken.
 * A re-run drops its own warnings by this prefix; `buildDependencyGraph`'s
 * collision warnings read `id collision: "…` and are left alone.
 */
const GROUP_COLLISION_WARNING = 'id collision: directory'

/** The order `Ecosystem`'s derived `Ord` gives on the Rust side. */
const ECOSYSTEM_RANK: Record<Ecosystem, number> = { node: 0, rust: 1 }

/**
 * Stamp `parent` on every node and insert the synthetic `repo` / `group` nodes
 * the tree needs. Idempotent: a second call re-derives from scratch under its
 * own `options`, landing exactly where a first call with those options would.
 * Meant to run once, straight after `buildDependencyGraph`.
 */
export function applyContainment(graph: DependencyGraph, options: ContainmentOptions = {}): void {
  // Undo any previous pass first. Everything below is minted unconditionally,
  // so re-running over an already-contained graph would append a SECOND
  // `repo:root` and a second external group per ecosystem. `repo` and `group`
  // are the kinds only this pass mints — `buildDependencyGraph` emits
  // `package`, `crate` and `external` — so dropping those nodes, unstamping
  // every `parent` and clearing the warnings this pass owns restores the
  // pre-containment shape.
  graph.nodes = graph.nodes.filter((n) => n.kind !== 'repo' && n.kind !== 'group')
  for (const node of graph.nodes) node.parent = null
  graph.warnings = graph.warnings.filter((w) => !w.startsWith(GROUP_COLLISION_WARNING))

  const rootLabel = options.rootLabel ?? 'repository'
  const groupExternals = options.groupExternals ?? true
  const usedIds = new Set<string>(graph.nodes.map((n) => n.id))

  // ── the root ─────────────────────────────────────────────────────────
  // Always synthetic. The checkout is not the same thing as the manifest that
  // happens to sit at its top — and a monorepo root commonly carries TWO (a
  // `package.json` beside a virtual-workspace `Cargo.toml`), so electing one
  // of them the repo would be arbitrary. Both become children.
  usedIds.add(ROOT_ID)
  graph.nodes.unshift({
    id: ROOT_ID,
    name: rootLabel,
    dir: '',
    ecosystem: null,
    external: false,
    kind: 'repo',
    parent: null,
  })

  // ── which node owns which directory ──────────────────────────────────
  // Two manifests can share a directory (a `package.json` beside a
  // `Cargo.toml`). Below the root the first in walk order owns the dir and the
  // other becomes its child, rather than a sibling floating at the grandparent.
  const dirOwner = new Map<string, string>([['', ROOT_ID]])
  const coLocated = new Map<string, string>()
  for (const node of graph.nodes) {
    if (node.external || node.id === ROOT_ID) continue
    const dir = node.dir
    if (dir === null) continue
    if (dir === '') continue // a top-level manifest is a child of the repo, not the repo
    const owner = dirOwner.get(dir)
    if (owner === undefined) dirOwner.set(dir, node.id)
    else coLocated.set(node.id, owner)
  }

  // ── candidate group directories ──────────────────────────────────────
  // Every proper ancestor of a manifest dir that holds no manifest itself.
  const groupDirs = new Set<string>()
  for (const dir of dirOwner.keys()) {
    for (const ancestor of ancestors(dir)) {
      if (!dirOwner.has(ancestor)) groupDirs.add(ancestor)
    }
  }

  // ── chain collapse ───────────────────────────────────────────────────
  // A group with exactly one child says nothing the child does not already
  // say, so `…/runners/sqlite/builder` reports one node, not three, while
  // `packages/ts` (many children) survives. Manifest dirs are never removed:
  // they are real, whatever their fan-out.
  for (;;) {
    const tree = new Set<string>([...dirOwner.keys(), ...groupDirs])
    const childCount = new Map<string, number>()
    for (const dir of tree) {
      if (dir === '') continue
      const parent = nearestAncestor(dir, tree)
      childCount.set(parent, (childCount.get(parent) ?? 0) + 1)
    }
    const doomed = [...groupDirs].filter((g) => (childCount.get(g) ?? 0) <= 1)
    if (doomed.length === 0) break
    for (const g of doomed) groupDirs.delete(g)
  }

  // ── materialize the surviving groups ─────────────────────────────────
  const tree = new Set<string>([...dirOwner.keys(), ...groupDirs])
  // Sorted, because the Rust reference holds these in a BTreeSet and both id
  // claiming and node order depend on the traversal.
  const sortedGroupDirs = [...groupDirs].sort(byteCompare)
  const groupIds = new Map<string, string>()
  for (const dir of sortedGroupDirs) {
    const id = claim(dir, usedIds)
    if (id !== dir) {
      graph.warnings.push(`${GROUP_COLLISION_WARNING} "${dir}" already taken — using "${id}"`)
    }
    groupIds.set(dir, id)
  }
  const idAt = (dir: string): string => dirOwner.get(dir) ?? groupIds.get(dir) ?? ROOT_ID

  const groupNodes: GraphNode[] = sortedGroupDirs.map((dir) => {
    const parentDir = nearestAncestor(dir, tree)
    return {
      id: groupIds.get(dir)!,
      name: labelUnder(dir, parentDir),
      dir,
      ecosystem: null,
      external: false,
      kind: 'group',
      parent: idAt(parentDir),
    }
  })

  // ── stamp parents on the manifests ───────────────────────────────────
  for (const node of graph.nodes) {
    if (node.external || node.id === ROOT_ID) continue
    const owner = coLocated.get(node.id)
    if (owner !== undefined) {
      node.parent = owner
      continue
    }
    if (node.dir === null) continue
    node.parent = idAt(nearestAncestor(node.dir, tree))
  }

  // ── externals ────────────────────────────────────────────────────────
  const externalGroups: GraphNode[] = []
  if (groupExternals) {
    const ecosystems = [
      ...new Set(
        graph.nodes.filter((n) => n.external && n.ecosystem !== null).map((n) => n.ecosystem!),
      ),
    ].sort((a, b) => ECOSYSTEM_RANK[a] - ECOSYSTEM_RANK[b])
    for (const ecosystem of ecosystems) {
      const id = externalGroupId(ecosystem)
      usedIds.add(id)
      externalGroups.push({
        id,
        name: externalGroupLabel(ecosystem),
        dir: null,
        ecosystem,
        external: true,
        kind: 'group',
        parent: null,
      })
    }
    for (const node of graph.nodes) {
      if (node.external && node.ecosystem !== null) node.parent = externalGroupId(node.ecosystem)
    }
  }

  // Groups land after the manifests and before the external tail, so the array
  // still reads root-ish → in-set → outside.
  const split = graph.nodes.findIndex((n) => n.external)
  const tail = graph.nodes.splice(split === -1 ? graph.nodes.length : split)
  graph.nodes.push(...groupNodes, ...externalGroups, ...tail)
}

/**
 * A group's display name: its path with the container's path stripped off.
 * `packages/ts` under `packages` reads `ts`; `tools/cage/crates` sitting at the
 * repo root (its middle links chain-collapsed) keeps all three segments rather
 * than claiming to be some other repo's `crates`.
 */
function labelUnder(dir: string, parentDir: string): string {
  if (parentDir === '') return dir
  return dir.startsWith(`${parentDir}/`) ? dir.slice(parentDir.length + 1) : dir
}

/**
 * Every proper ancestor of `dir`, excluding the root (`''`).
 * `a/b/c` → `['a', 'a/b']`.
 */
function ancestors(dir: string): string[] {
  const out: string[] = []
  const segments = dir.split('/').filter((s) => s !== '')
  let acc = ''
  for (const segment of segments.slice(0, Math.max(segments.length - 1, 0))) {
    acc = acc === '' ? segment : `${acc}/${segment}`
    out.push(acc)
  }
  return out
}

/**
 * The longest strict prefix of `dir` present in `tree`, on a `/` boundary.
 * Falls back to the root (`''`), which every tree contains.
 */
function nearestAncestor(dir: string, tree: ReadonlySet<string>): string {
  const candidates = ancestors(dir)
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (tree.has(candidates[i]!)) return candidates[i]!
  }
  return ''
}

/** `preferred` if free, else `preferred#group`, else numbered. */
function claim(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) {
    used.add(preferred)
    return preferred
  }
  const suffixed = `${preferred}#group`
  if (!used.has(suffixed)) {
    used.add(suffixed)
    return suffixed
  }
  let n = 2
  while (used.has(`${preferred}#group${n}`)) n++
  const id = `${preferred}#group${n}`
  used.add(id)
  return id
}

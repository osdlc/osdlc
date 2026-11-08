import { existsSync } from 'node:fs'
import { z } from 'zod'
import type { WikilinkCollection } from './remark-wikilinks.ts'
import { slugify } from './slug.ts'
import { walkFiles } from './walk.ts'

/**
 * A single collection, indexed for resolution. `byKey` maps a normalised lookup
 * key (bare stem, content-relative path, or vault path) to the Astro `entry.id`
 * (used as the route slug).
 */
export interface IndexedCollection {
  name: string
  route: string | null
  /** lookup key -> content id (the Astro `entry.id`, used as the route slug). */
  byKey: Map<string, string>
}

/**
 * Pre-built lookup consumed by {@link resolveRef}: the per-collection key
 * indexes (in config order — first match wins for untyped links) plus a
 * `type -> collection index` map for typed `type/slug` resolution.
 */
export interface RefIndex {
  /** Collections in config order; untyped links resolve first-match-by-order. */
  collections: IndexedCollection[]
  /** Short `type` prefix -> the collection that owns it (deterministic). */
  byType: Map<string, IndexedCollection>
}

const keySegment = slugify

/**
 * Normalise a link target or path into a lookup key: drop a trailing `.md`,
 * resolve `.` and `..` segments (a leading `..` is dropped, so a relative
 * link reaches the vault path), key each segment, drop empty ones, and rejoin
 * with `/`. Segment-wise (rather than whole-string) keying keeps `[[a/b]]`
 * distinct from `[[a-b]]`.
 *
 * @experimental Outside the stable API; it may change in a minor release.
 */
export function pathKey(p: string): string {
  return pathSegments(p).map(keySegment).filter(Boolean).join('/')
}

/** `p` without a trailing `.md`, split on `/`, with `.` and `..` resolved. */
function pathSegments(p: string): string[] {
  const segs: string[] = []
  for (const seg of p.replace(/\.md$/i, '').split('/')) {
    if (seg === '..') segs.pop()
    else if (seg !== '.') segs.push(seg)
  }
  return segs
}

/** `p`'s id in `col`, by its key. */
function lookup(col: IndexedCollection, p: string): string | undefined {
  return col.byKey.get(pathKey(p))
}

/** List markdown files under `dir` as `/`-separated relative paths (see {@link walkFiles}). */
export function listMarkdown(dir: string): string[] {
  return walkFiles(dir)
    .filter((f) => f.rel.endsWith('.md'))
    .map((f) => f.rel)
}

/**
 * Build the per-collection key index for one collection. Shared by the prose
 * remark visitor and frontmatter FK resolution so both paths agree on keys.
 */
function indexCollection(
  c: WikilinkCollection,
  onCollision?: (msg: string) => void,
): IndexedCollection {
  const byKey = new Map<string, string>()
  const add = (key: string, id: string) => {
    if (!key) return
    const existing = byKey.get(key)
    if (existing && existing !== id) {
      onCollision?.(`${c.name}: "${key}" → ${existing} or ${id}`)
      return // first one wins; keep it stable
    }
    byKey.set(key, id)
  }
  if (existsSync(c.dir)) {
    const ids = listMarkdown(c.dir).map((rel) => rel.replace(/\.md$/i, '')) // Astro entry.id
    // Exact paths first, so a nested file's bare name never takes the key of
    // a file whose own path it is.
    for (const id of ids) {
      add(pathKey(id), id) //   content-relative path: [[posts/some-file]]
      if (c.vaultDir) add(pathKey(`${c.vaultDir}/${id}`), id) // vault path
    }
    for (const id of ids) add(pathKey(id.split('/').pop() ?? id), id) // bare name: [[some-file]]
  }
  return { name: c.name, route: c.route, byKey }
}

/**
 * Build a {@link RefIndex} from the collections plus a `type -> collection name`
 * map. Pure: reads the filesystem (collection dirs) but mutates nothing. The
 * per-collection `byKey` indexing matches the prose resolver exactly.
 *
 * @experimental Outside the stable API; it may change in a minor release.
 */
export function buildRefIndex(
  collections: WikilinkCollection[],
  typeMap: Map<string, string>,
  onCollision?: (msg: string) => void,
): RefIndex {
  const indexed = collections.map((c) => indexCollection(c, onCollision))
  const byName = new Map(indexed.map((c) => [c.name, c]))
  const byType = new Map<string, IndexedCollection>()
  for (const [type, name] of typeMap) {
    const col = byName.get(name)
    if (col) byType.set(type, col)
  }
  return { collections: indexed, byType }
}

/**
 * Resolve a link target against a pre-built index. Handles four target forms:
 *
 *   - bare stem            `[[some-file]]`
 *   - content-relative     `[[posts/some-file]]`
 *   - vault path           `[[00/posts/some-file]]`
 *   - typed `type/slug`    `[[health/some-record]]` (selects the mapped
 *                          collection deterministically, bypassing config order)
 *
 * Untyped forms iterate collections in config order, first match wins. Returns
 * `null` on a miss.
 *
 * @experimental Outside the stable API; it may change in a minor release.
 */
export function resolveRef(
  target: string,
  index: RefIndex,
): { collection: string; id: string; href: string | null } | null {
  // Typed `type/slug`: split on the FIRST `/`; if the prefix is a known type,
  // resolve the remainder directly against that collection (bypass config order).
  const slash = target.indexOf('/')
  if (slash > 0) {
    const type = target.slice(0, slash)
    const slug = target.slice(slash + 1)
    const col = index.byType.get(type)
    if (col && slug) {
      const id = lookup(col, slug)
      if (id !== undefined) {
        return hit(col, id)
      }
      // Known type but unresolved slug: a miss (do not fall through to the
      // untyped path, which could match the literal `type/slug` as a vault key).
      return null
    }
  }

  // Untyped: bare stem / content-relative / vault path, first-match-by-order.
  for (const col of index.collections) {
    const id = lookup(col, target)
    if (id !== undefined) {
      return hit(col, id)
    }
  }
  return null
}

function hit(col: IndexedCollection, id: string) {
  const href = col.route ? col.route.replace(':slug', () => id) : null
  return { collection: col.name, id, href }
}

const SLUG_RE = /^[^\s/]+(?:\/[^\s/]+)*$/ // non-empty, no spaces; allows path segments

/**
 * A Zod helper validating the quoted `"[[type/slug]]"` foreign-key shape for a
 * given collection `type`. The value must be exactly `[[<type>/<slug>]]` where
 * `<slug>` is non-empty and contains no spaces. An optional Obsidian display
 * alias may follow the slug as `[[<type>/<slug>|Alias With Spaces]]`; the alias
 * is ignored for validation (only the `<slug>` before the `|` must be clean),
 * and downstream consumers (e.g. `parseWikiLink`) read it as the display label.
 * When an `index` is supplied, the target must additionally resolve (be
 * non-null) via {@link resolveRef}.
 */
export function wikilinkRef(type: string, index?: RefIndex) {
  return z.string().refine(
    (value) => {
      const m = /^\[\[(.+)\]\]$/.exec(value)
      if (!m) return false
      // Strip a trailing `|alias` display segment before validating the slug;
      // the alias may contain spaces and is purely presentational.
      const inner = m[1]!.split('|')[0]!
      const slash = inner.indexOf('/')
      if (slash <= 0) return false
      if (inner.slice(0, slash) !== type) return false
      const slug = inner.slice(slash + 1)
      if (!SLUG_RE.test(slug)) return false
      if (index) return resolveRef(`${type}/${slug}`, index) !== null
      return true
    },
    { message: `Expected a "[[${type}/<slug>]]" wikilink reference` },
  )
}

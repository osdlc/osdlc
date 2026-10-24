/**
 * A named view of a system graph, and the port a host satisfies to keep them.
 *
 * A saved view is the whole configuration of a drawing: which rendering, what
 * is filtered, what is folded, and — once anything has been dragged — where
 * particular things were put. Restoring one puts the surface back exactly as
 * it was left.
 *
 * THE SPEC IS OPAQUE HERE. `spec` is an unread bag of keys rather than a typed
 * shape: the viewer owns what a view MEANS, and this package is the contract a
 * Rust desktop app and a Nitro server both depend on. Typing thirty view
 * options here would make every new control a breaking change to both.
 *
 * It also decides what happens to old saves. The viewer writes a MINIMAL DIFF
 * against its own defaults, so a view saved today restores correctly after a
 * new option is added (it takes the new default) and after one is removed (the
 * stale key is ignored by the merge). Storing the full spec would freeze every
 * saved view at the moment it was written.
 */

/** Where one node was put, in the layout's own coordinates. */
export interface PositionOverride {
  x: number
  y: number
}

/** One named view: its slug, title, view options and hand-placed positions. */
export interface SavedView {
  /** Stable, URL-safe, and the store's key: kebab-case. */
  slug: string
  /** What to call it in a list. */
  title: string
  description: string | null
  /**
   * The view options, as the viewer's own minimal diff against its defaults.
   * Opaque to the store and to this contract — see the note on this module.
   */
  spec: Record<string, unknown>
  /**
   * Hand-placed positions, by node id. SPARSE, and a map rather than a
   * document: the node set changes with every fold and filter, so an override
   * has to survive nodes appearing and disappearing rather than describe a
   * fixed canvas. A node with no entry follows the layout.
   */
  overlay: Record<string, PositionOverride>
}

/**
 * Where saved views live. A host implements this against whatever it already
 * has — the desktop app its vault, the standalone product a directory beside
 * the project it walked.
 *
 * `save` is an upsert keyed by slug, because "save" and "save again after
 * moving something" are the same act to the person doing it.
 */
export interface SavedViewStore {
  list(): Promise<SavedView[]>
  save(view: SavedView): Promise<void>
  remove(slug: string): Promise<void>
}

/** The slug shape every implementation must accept, and reject outside of. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/**
 * A title turned into a slug: lowercase, non-alphanumerics folded to a single
 * dash, ends trimmed. Returns `''` when nothing survives, which the caller has
 * to handle rather than save under a meaningless key.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

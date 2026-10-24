/**
 * A named view of a system graph, and the port a host implements to store them.
 *
 * A saved view is the whole configuration of a drawing: which rendering, what
 * is filtered, what is folded, and where nodes were dragged to, if any.
 * Restoring one puts the viewer back exactly as it was left.
 *
 * This package does not read `spec`. It is an untyped record of keys. The
 * viewer decides what a view means, and this package is the contract that a
 * Rust desktop app and a Nitro server both depend on. Typing thirty view
 * options here would make every new control a breaking change to both.
 *
 * This also decides what happens to old saves. The viewer writes only the
 * keys that differ from its own defaults. So a view saved today restores
 * correctly after a new option is added (it takes the new default) and after
 * one is removed (the merge ignores the stale key). Storing the full spec
 * would fix every saved view at the options that existed when it was written.
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
   * The view options that differ from the viewer's defaults. The store and
   * this contract do not read it. See the note on this module.
   */
  spec: Record<string, unknown>
  /**
   * Hand-placed positions, by node id. Sparse, and a map rather than a full
   * layout. The node set changes with every fold and filter, so an override
   * must still apply as nodes appear and disappear. A node with no entry
   * follows the layout.
   */
  overlay: Record<string, PositionOverride>
}

/**
 * Where saved views are stored. A host implements this with the storage it
 * already has. The desktop app uses its vault. The standalone product uses a
 * directory beside the project it walked.
 *
 * `save` is an upsert keyed by slug, because "save" and "save again after
 * moving something" are the same action to the user.
 */
export interface SavedViewStore {
  list(): Promise<SavedView[]>
  save(view: SavedView): Promise<void>
  remove(slug: string): Promise<void>
}

/** The slug shape every implementation must accept. Anything else is rejected. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/**
 * A title turned into a slug: lowercase, each run of non-alphanumerics replaced
 * by one dash, and dashes trimmed from the ends. Returns `''` when nothing is
 * left. The caller must handle that case, not save under an empty key.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

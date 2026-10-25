/**
 * The key tables: every key each interactive surface takes, with what it
 * does. The help screens and the guide read them, so a key is described in
 * one place. Browser-safe: the page imports it.
 */

/** One binding: the keys as a person types them, and what they do. */
export interface KeyBinding {
  /** Each spelling that does the same thing, such as `['↑', '↓']`. */
  readonly keys: readonly string[]
  /** What it does, as a short phrase. */
  readonly action: string
}

/** The web view's keys. */
export const WEB_KEYS: readonly KeyBinding[] = [
  { keys: ['/'], action: 'search' },
  { keys: ['Enter'], action: 'copy the top hit, or the focused task' },
  { keys: ['Shift+Enter'], action: 'run the top hit, or the focused task' },
  { keys: ['↑', '↓'], action: 'move through the tasks' },
  { keys: ['Esc'], action: 'back to search; again to clear it' },
  { keys: ['?'], action: 'this help' },
]

/**
 * Config key lists that the page needs as well as the CLI. Browser-safe: no
 * Node built-in, so the web view imports it.
 */

/** The `theme` values for the web view. `system` follows the browser. */
export const THEME_VALUES = ['system', 'light', 'dark'] as const
/** The web view's theme. */
export type Theme = (typeof THEME_VALUES)[number]

/** The `discovery` values. */
export const DISCOVERY_VALUES = ['git', 'walk', 'auto'] as const

/** The `open` values: what the bare `way` command opens. */
export const OPEN_VALUES = ['tui', 'web'] as const

/**
 * The keys `config set` and `config unset` change from the command line only.
 * cli-tool's adapters, such as the HTTP one the web view's server runs,
 * refuse a write of any of them: an agent or a page must not grant trust,
 * turn execution on, or name code to load.
 */
export const CLI_ONLY_KEYS: readonly string[] = ['trust', 'allowExec', 'tools']

/** The top-level keys only the user layer may set. */
export const USER_ONLY_KEYS: readonly string[] = ['trust', 'open', 'theme', 'skills']

/**
 * The file a settings screen writes `key` to, given where its value comes
 * from now (`default`, `user` or `project`). A user-only key goes to the
 * user file. `runners.order` goes to the file that sets it, else the user
 * file, so a reorder always takes effect. Every other key goes to the
 * project file.
 */
export function settingLayer(key: string, source: string): 'user' | 'project' {
  if (USER_ONLY_KEYS.includes(key.split('.')[0]!)) return 'user'
  if (key === 'runners.order') return source === 'project' ? 'project' : 'user'
  return 'project'
}

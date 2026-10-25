/**
 * Config key lists that the page needs as well as the CLI. Browser-safe: no
 * Node built-in, so the web view imports it.
 */

/** The `theme` values for the web view. `system` follows the browser. */
export const THEME_VALUES = ['system', 'light', 'dark'] as const
/** The web view's theme. */
export type Theme = (typeof THEME_VALUES)[number]

/**
 * The keys `config set` and `config unset` change from the command line only.
 * The MCP and HTTP adapters refuse a write of any of them: an agent or a page
 * must not grant trust, turn execution on, or name code to load.
 */
export const CLI_ONLY_KEYS: readonly string[] = ['trust', 'allowExec', 'tools']

/** The top-level keys only the user layer may set. */
export const USER_ONLY_KEYS: readonly string[] = ['trust', 'open', 'theme', 'skills']

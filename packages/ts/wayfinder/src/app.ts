/**
 * The app's names. Every user-facing name that carries the product name
 * derives from here. Browser-safe: the page imports it too.
 */

/** The product name: config directory, cache directory and trust store key. Messages start with {@link BIN}. */
export const APP = 'wayfinder'

/** The installed command. */
export const BIN = 'way'

/** Names the user config file, replacing its location only. */
export const CONFIG_ENV_VAR = `${APP.toUpperCase()}_CONFIG`

/** The project config file, read from the project root. */
export const PROJECT_CONFIG_FILENAME = `${APP}.config.json`

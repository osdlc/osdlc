/**
 * The app's names. The product name may change, so every user-facing name
 * that carries it derives from here. Browser-safe: the page imports it too.
 */

/** The product name: config directory, cache directory, trust store key, message prefix. */
export const APP = 'waypost'

/** The installed command. */
export const BIN = 'way'

/** Names the user config file, replacing its location only. */
export const CONFIG_ENV_VAR = `${APP.toUpperCase()}_CONFIG`

/** The project config file, read from the project root. */
export const PROJECT_CONFIG_FILENAME = `${APP}.config.json`

/** The request header that carries the web view's session token. */
export const TOKEN_HEADER = `x-${APP}-token`

/**
 * The app's names. Every user-facing name that carries the product name
 * derives from here. Browser-safe: the page imports it too.
 */

/** The product name: config directory, cache directory, trust store key, message prefix. */
export const APP = 'wayfinder'

/**
 * The name before the rename to wayfinder. Its user config, project config,
 * trust store and config variable are still read when the new ones are
 * absent. Nothing is written under it.
 */
export const LEGACY_APP = 'waypost'

/** The installed command. */
export const BIN = 'way'

/** Names the user config file, replacing its location only. */
export const CONFIG_ENV_VAR = `${APP.toUpperCase()}_CONFIG`

/** The old name of {@link CONFIG_ENV_VAR}, read when that one is unset. */
export const LEGACY_CONFIG_ENV_VAR = `${LEGACY_APP.toUpperCase()}_CONFIG`

/** The project config file, read from the project root. */
export const PROJECT_CONFIG_FILENAME = `${APP}.config.json`

/** The old project config file, read when {@link PROJECT_CONFIG_FILENAME} is absent. */
export const LEGACY_PROJECT_CONFIG_FILENAME = `${LEGACY_APP}.config.json`

/** The request header that carries the web view's session token. */
export const TOKEN_HEADER = `x-${APP}-token`

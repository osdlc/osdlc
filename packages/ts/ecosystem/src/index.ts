/**
 * `@osdlc/ecosystem`: the facts and rules every osdlc tool shares.
 *
 * Each concern is its own module and subpath export, so a tool imports only
 * what it needs. `@osdlc/ecosystem/repositories` is the first: where a
 * person's checkouts are.
 *
 * The package entry holds what every concern builds on: where the family's
 * directories are. The osdlc tools share one root in each home, `osdlc`,
 * placed as the machine-files standard says: `standalone('osdlc')` with
 * `envVars('OSDLC')`, pinned to the Xdg convention so that one file has one
 * path whichever program reads it.
 */

import { envVars, systemDirs, type TieredDirs, type VendorDirs } from '@osdlc/config-layers'

/**
 * The vendor segment and override variables of the osdlc family: `osdlc`,
 * moved by `OSDLC_ROOT` and `OSDLC_<HOME>_DIR`. Pass it to config-layers as a
 * tool's `vendorDirs`.
 */
export const OSDLC_VENDOR_DIRS: Readonly<VendorDirs> = Object.freeze({
  vendor: 'osdlc',
  envVars: envVars('OSDLC'),
})

/** Options for {@link osdlcDirs}. */
export interface OsdlcDirsOptions {
  /**
   * The environment to read the override variables and the home directory
   * from. Defaults to `process.env`. When given, it is the only environment
   * read, so a test never reaches the real home.
   */
  env?: Record<string, string | undefined> | undefined
  /** The home directory. Overrides `HOME` (`USERPROFILE` on Windows) when given. */
  home?: string | undefined
}

/**
 * The osdlc family's directories, pinned to the Xdg convention:
 * `~/.config/osdlc`, `~/.cache/osdlc` and `~/.local/state/osdlc` on Linux and
 * macOS with no variable set. `OSDLC_CONVENTION` moves none of them, since a
 * family file read at two paths would give two answers.
 *
 * `dirs.standalone('osdlc').config()` is the config home the family files
 * sit in; `.app('<tool>')` under it is a tool's own directory.
 */
export function osdlcDirs(opts: OsdlcDirsOptions = {}): TieredDirs {
  return systemDirs(OSDLC_VENDOR_DIRS, {
    convention: 'xdg',
    conventionFromEnv: false,
    ...(opts.env === undefined ? {} : { env: opts.env }),
    ...(opts.home === undefined ? {} : { home: opts.home }),
  })
}

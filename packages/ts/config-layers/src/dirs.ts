/**
 * Whose machine-local directories a tool's state lives under.
 *
 * A tool's machine config file and its link state sit in its standalone
 * config home (`<config>/<tool>/`). The vendor and the override variables
 * (`<PREFIX>_ROOT`, `<PREFIX>_<HOME>_DIR`) belong to whoever ships the tool,
 * so the tool supplies them. This package does not fix them.
 */
import {
  type EnvVars,
  envVars,
  type ResolveOptions,
  systemBaseDirs,
  TieredDirs,
} from '@osdlc/tiered-dirs'

export { envVars, TieredDirs }
export type { EnvVars, ResolveOptions }

/**
 * The vendor segment and override variables that place a tool's machine-local directories.
 * @experimental
 */
export interface VendorDirs {
  /** The vendor segment, e.g. `com.example`. */
  vendor: string
  /** The override variables, e.g. `envVars('EXAMPLE')`. */
  envVars: EnvVars
}

/**
 * The vendor's directories, resolved from the environment.
 *
 * @experimental
 */
export function systemDirs(v: VendorDirs, opts: ResolveOptions = {}): TieredDirs {
  return new TieredDirs(v.vendor, systemBaseDirs(v.envVars, opts))
}

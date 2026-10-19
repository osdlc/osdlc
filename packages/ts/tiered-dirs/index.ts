/**
 * `@osdlc/tiered-dirs` — one answer to "where does this state live?" for a
 * vendor's products, in Rust and TypeScript alike.
 *
 * Two axes. The tier says who shares the state (the vendor, a suite of
 * products that share user data, or one general tool shipped outside the
 * suite). The home says how durable it is (durable, config, cache, state,
 * logs, runtime). A caller names both:
 *
 * ```ts
 * TieredDirs.fromEnv('com.example', envVars('EXAMPLE')).suite('notes').cache().app('search')
 * ```
 *
 * `TieredDirs.scratch()` sits outside both axes: the platform temp directory,
 * for state that does not outlive a single call.
 *
 * This module is the twin of the Rust `tiered-dirs` crate. Identical input
 * must yield an identical relative path in both, and `tests/parity.test.ts`
 * pins that against a fixture both twins read.
 */

export { TieredDirsError } from './errors.ts'
export type { TieredDirsErrorCode } from './errors.ts'
export { isValidSegment } from './segment.ts'
export {
  CONVENTIONS,
  HOMES,
  envVars,
  isOverridden,
  overrideVars,
  parseConvention,
  rootedBaseDirs,
  systemBaseDirs,
  testRoot,
  xdgBaseDirs,
} from './base-dirs.ts'
export type { BaseDirs, Convention, EnvVars, Home, ResolveOptions } from './base-dirs.ts'
export { TIER_KINDS, TieredDirs, isVendorBundleId } from './tiered-dirs.ts'
// `Dir` and `Tier` are types only: a caller gets one from the checked methods
// (`TieredDirs.vendor/suite/standalone/scratch`, `Tier.home`, `Dir.scoped/app`),
// never from a constructor.
export type { Dir, Tier, TierKind } from './tiered-dirs.ts'
